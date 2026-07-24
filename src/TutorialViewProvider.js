const vscode = require("vscode");
const fs = require("fs");
const yaml = require("yaml");
const os = require("os");
const path = require("path");

const tutorialDir = path.join(os.homedir(), ".hs-kbd-tutorial");
const stateFilePath = path.join(tutorialDir, ".state.json");
const workspaceTutorialFolder = "Tastatur-Tutorial";
const managedWorkspacePath = path.join(tutorialDir, "workspace");
const pendingWorkspaceStepStateKey =
    "hackschuleKeyboardTutorial.pendingWorkspaceStep";

function serializePosition(position) {
    return {
        line: position.line,
        character: position.character,
    };
}

function serializeSelection(selection) {
    return {
        anchor: serializePosition(selection.anchor),
        active: serializePosition(selection.active),
        start: serializePosition(selection.start),
        end: serializePosition(selection.end),
        isEmpty: selection.isEmpty,
    };
}

function serializeRange(range) {
    // Existing tutorial steps use visibleRanges[0][0] and [0][1].
    return [serializePosition(range.start), serializePosition(range.end)];
}

function serializeDocument(document) {
    return {
        uri: document.uri.toString(),
        fileName: document.fileName,
        languageId: document.languageId,
        lineCount: document.lineCount,
        isDirty: document.isDirty,
    };
}

function tabUri(tab) {
    return tab.input instanceof vscode.TabInputText
        ? tab.input.uri
        : undefined;
}

class TutorialViewProvider {
    constructor(context, sections) {
        this.context = context;
        this.sections = sections;
        this.webviewView = undefined;
        this.activeTutorialDocumentUri = undefined;
        this.activeTutorialOriginalContents = undefined;
        this.activeTutorialRootUri = undefined;
        this.activeWorkspaceFixturePath = undefined;
        this.activeEventTypes = new Set();
        this.currentStepKey = undefined;
        this.loadQueue = Promise.resolve();
    }

    readCompletionState() {
        const state = {};
        for (const section of this.sections.sections) {
            for (const step of section.steps) {
                state[step.key] = false;
            }
        }

        fs.mkdirSync(tutorialDir, { recursive: true });
        if (fs.existsSync(stateFilePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(stateFilePath, "utf8"));
                for (const key of Object.keys(data)) {
                    if (key in state) {
                        state[key] = data[key] === true;
                    }
                }
            } catch (error) {
                console.warn("Could not read keyboard tutorial state:", error);
            }
        }
        return state;
    }

    writeCompletionState(state) {
        fs.mkdirSync(tutorialDir, { recursive: true });
        fs.writeFileSync(stateFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    }

    markStepComplete(step) {
        const state = this.readCompletionState();
        if (!(step in state)) {
            return;
        }
        state[step] = true;
        this.writeCompletionState(state);
    }

    postMessage(message) {
        if (!this.webviewView) {
            return false;
        }
        void this.webviewView.webview.postMessage(message);
        return true;
    }

    watches(eventType) {
        return this.activeEventTypes.has(eventType);
    }

    isUriInside(rootUri, candidateUri) {
        if (!rootUri || !candidateUri ||
            rootUri.scheme !== candidateUri.scheme ||
            rootUri.authority !== candidateUri.authority) {
            return false;
        }

        const rootPath = rootUri.path.endsWith("/")
            ? rootUri.path
            : `${rootUri.path}/`;

        return candidateUri.path === rootUri.path ||
            candidateUri.path.startsWith(rootPath);
    }

    isActiveTutorialUri(uri) {
        if (!uri) {
            return false;
        }

        if (this.activeTutorialRootUri) {
            return this.isUriInside(this.activeTutorialRootUri, uri);
        }

        return this.activeTutorialDocumentUri !== undefined &&
            uri.toString() === this.activeTutorialDocumentUri;
    }

    isActiveTutorialDocument(document) {
        return Boolean(document) && this.isActiveTutorialUri(document.uri);
    }

    relativeTutorialPath(uri) {
        if (this.activeTutorialRootUri &&
            this.isUriInside(this.activeTutorialRootUri, uri)) {
            return path.posix.relative(
                this.activeTutorialRootUri.path,
                uri.path,
            );
        }

        return path.posix.basename(uri.path);
    }

    serializeTutorialUri(uri) {
        return {
            uri: uri.toString(),
            path: uri.path,
            fsPath: uri.fsPath,
            relativePath: this.relativeTutorialPath(uri),
        };
    }

    parseStep(key, webview) {
        const htmlPath = vscode.Uri.joinPath(
            this.context.extensionUri,
            "tutorial",
            `${key}.html`,
        ).fsPath;

        if (!fs.existsSync(htmlPath)) {
            throw new Error(`Tutorial step not found: ${key}`);
        }

        const step = {};
        let htmlContent = fs.readFileSync(htmlPath, "utf8");
        htmlContent = htmlContent.replaceAll(
            "tutorial/keyboard.jpg",
            webview.asWebviewUri(
                vscode.Uri.joinPath(
                    this.context.extensionUri,
                    "tutorial",
                    "keyboard.jpg",
                ),
            ),
        );

        const yamlMatch = htmlContent.match(/<yaml>([\s\S]*?)<\/yaml>/i);
        if (yamlMatch) {
            Object.assign(step, yaml.parse(yamlMatch[1].trim()) ?? {});
            htmlContent = htmlContent.replace(yamlMatch[0], "");
        }

        const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/i);
        if (scriptMatch) {
            step.script = scriptMatch[1].trim();
            htmlContent = htmlContent.replace(scriptMatch[0], "");
        }

        step.instruction = htmlContent.trim();
        return step;
    }

    updateActiveEventTypes(script = "") {
        const handlers = {
            onDidChangeTextDocument: "handleOnDidChangeTextDocument",
            onDidSaveTextDocument: "handleOnDidSaveTextDocument",
            onDidChangeTextEditorSelection:
                "handleOnDidChangeTextEditorSelection",
            onDidChangeActiveTextEditor:
                "handleOnDidChangeActiveTextEditor",
            onDidChangeTextEditorOptions:
                "handleOnDidChangeTextEditorOptions",
            onDidChangeTextEditorVisibleRanges:
                "handleOnDidChangeTextEditorVisibleRanges",
            onDidCreateFiles: "handleOnDidCreateFiles",
            onDidRenameFiles: "handleOnDidRenameFiles",
            onDidDeleteFiles: "handleOnDidDeleteFiles",
            onDidChangeTabs: "handleOnDidChangeTabs",
        };

        this.activeEventTypes = new Set(
            Object.entries(handlers)
                .filter(([, handlerName]) => script.includes(handlerName))
                .map(([eventType]) => eventType),
        );
    }

    async resetDocument(document, contents) {
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length),
        );
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, fullRange, contents);
        await vscode.workspace.applyEdit(edit);
        await document.save();
    }

    findTabsForUri(uriString) {
        const tabs = [];

        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                const uri = tabUri(tab);
                if (uri?.toString() === uriString) {
                    tabs.push(tab);
                }
            }
        }

        return tabs;
    }

    findTabsInsideRoot(rootUri) {
        const tabs = [];

        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                const uri = tabUri(tab);
                if (uri && this.isUriInside(rootUri, uri)) {
                    tabs.push(tab);
                }
            }
        }

        return tabs;
    }

    async closeTabs(tabs, includeDirty = false) {
        const closable = tabs.filter(tab => includeDirty || !tab.isDirty);
        if (closable.length === 0) {
            return;
        }

        await vscode.window.tabGroups.close(closable, true);
    }

    async openStepDocument(key, step, restart) {
        this.activeTutorialRootUri = undefined;
        this.activeWorkspaceFixturePath = undefined;

        if (!step.file) {
            this.activeTutorialDocumentUri = undefined;
            this.activeTutorialOriginalContents = undefined;
            return { document: undefined, editor: undefined };
        }

        const sourcePath = vscode.Uri.joinPath(
            this.context.extensionUri,
            step.file,
        ).fsPath;

        if (!fs.existsSync(sourcePath)) {
            throw new Error(`Tutorial source file not found: ${step.file}`);
        }

        const contents = fs.readFileSync(sourcePath, "utf8");
        const stepDir = path.join(tutorialDir, "steps", key);
        const workingPath = path.join(stepDir, path.basename(sourcePath));
        fs.mkdirSync(stepDir, { recursive: true });

        if (!fs.existsSync(workingPath)) {
            fs.writeFileSync(workingPath, contents, "utf8");
        }

        let document = await vscode.workspace.openTextDocument(workingPath);
        this.activeTutorialDocumentUri = document.uri.toString();
        this.activeTutorialOriginalContents = contents;

        if (restart) {
            await this.resetDocument(document, contents);
            document = await vscode.workspace.openTextDocument(workingPath);
        }

        const editor = await vscode.window.showTextDocument(document, {
            preview: false,
        });

        if (step.cursor) {
            const position = new vscode.Position(
                step.cursor[0] - 1,
                step.cursor[1] - 1,
            );
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
                new vscode.Range(position, position),
                step.cursor[2] === "top"
                    ? vscode.TextEditorRevealType.AtTop
                    : vscode.TextEditorRevealType.InCenter,
            );
        }

        if (step.scrollY) {
            const position = new vscode.Position(step.scrollY - 1, 0);
            editor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.AtTop,
            );
        }

        return { document, editor };
    }

    async uriExists(uri) {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch (error) {
            if (error instanceof vscode.FileSystemError &&
                error.code === "FileNotFound") {
                return false;
            }
            throw error;
        }
    }

    async copyFixtureDirectory(sourcePath, targetUri) {
        await vscode.workspace.fs.createDirectory(targetUri);

        for (const entry of fs.readdirSync(sourcePath, {
            withFileTypes: true,
        })) {
            const sourceEntry = path.join(sourcePath, entry.name);
            const targetEntry = vscode.Uri.joinPath(targetUri, entry.name);

            if (entry.isDirectory()) {
                await this.copyFixtureDirectory(sourceEntry, targetEntry);
            } else if (entry.isFile()) {
                await vscode.workspace.fs.writeFile(
                    targetEntry,
                    fs.readFileSync(sourceEntry),
                );
            }
        }
    }

    async resetWorkspaceStep(rootUri, fixturePath) {
        await this.closeTabs(
            this.findTabsInsideRoot(rootUri),
            true,
        );

        if (await this.uriExists(rootUri)) {
            await vscode.workspace.fs.delete(rootUri, {
                recursive: true,
                useTrash: false,
            });
        }

        await this.copyFixtureDirectory(fixturePath, rootUri);
    }

    async openWorkspaceStep(key, step, restart) {
        let workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        if (!workspaceFolder) {
            /*
             * The Explorer needs a workspace folder. Create a private
             * tutorial workspace and open it automatically instead of
             * asking the student to prepare one.
             *
             * Opening a folder in the current window restarts the extension
             * host, so remember which step must resume afterwards.
             */
            const managedWorkspaceUri =
                vscode.Uri.file(managedWorkspacePath);

            await vscode.workspace.fs.createDirectory(
                managedWorkspaceUri,
            );

            await this.context.globalState.update(
                pendingWorkspaceStepStateKey,
                {
                    key,
                    workspaceUri: managedWorkspaceUri.toString(),
                },
            );

            try {
                await vscode.commands.executeCommand(
                    "vscode.openFolder",
                    managedWorkspaceUri,
                    {
                        forceReuseWindow: true,
                        noRecentEntry: true,
                    },
                );
            } catch (error) {
                await this.context.globalState.update(
                    pendingWorkspaceStepStateKey,
                    undefined,
                );
                throw error;
            }

            return {
                document: undefined,
                editor: undefined,
                reopeningWorkspace: true,
            };
        }

        const fixturePath = vscode.Uri.joinPath(
            this.context.extensionUri,
            step.workspace,
        ).fsPath;

        if (!fs.existsSync(fixturePath) ||
            !fs.statSync(fixturePath).isDirectory()) {
            throw new Error(
                `Tutorial workspace fixture not found: ${step.workspace}`,
            );
        }

        const rootUri = vscode.Uri.joinPath(
            workspaceFolder.uri,
            workspaceTutorialFolder,
            key,
        );

        this.activeTutorialDocumentUri = undefined;
        this.activeTutorialOriginalContents = undefined;
        this.activeTutorialRootUri = rootUri;
        this.activeWorkspaceFixturePath = fixturePath;

        if (restart || !(await this.uriExists(rootUri))) {
            await this.resetWorkspaceStep(rootUri, fixturePath);
        }

        let document;
        let editor;

        const openFiles = Array.isArray(step.openFiles)
            ? step.openFiles
            : [];

        for (const relativePath of openFiles) {
            const uri = vscode.Uri.joinPath(rootUri, relativePath);
            document = await vscode.workspace.openTextDocument(uri);
            editor = await vscode.window.showTextDocument(document, {
                preview: false,
            });
        }

        if (step.activeFile) {
            const activeUri = vscode.Uri.joinPath(rootUri, step.activeFile);
            document = await vscode.workspace.openTextDocument(activeUri);
            editor = await vscode.window.showTextDocument(document, {
                preview: false,
            });
        }

        if (document) {
            this.activeTutorialDocumentUri = document.uri.toString();
        }

        return { document, editor };
    }

    async cleanUpStepBeforeLeaving(nextStepKey) {
        if (!this.currentStepKey || this.currentStepKey === nextStepKey) {
            return;
        }

        const state = this.readCompletionState();
        const completed = state[this.currentStepKey] === true;

        if (this.activeTutorialRootUri) {
            if (completed && this.activeWorkspaceFixturePath) {
                await this.resetWorkspaceStep(
                    this.activeTutorialRootUri,
                    this.activeWorkspaceFixturePath,
                );
            } else {
                await this.closeTabs(
                    this.findTabsInsideRoot(this.activeTutorialRootUri),
                    false,
                );
            }

            this.activeTutorialRootUri = undefined;
            this.activeWorkspaceFixturePath = undefined;
            this.activeTutorialDocumentUri = undefined;
            this.activeTutorialOriginalContents = undefined;
            return;
        }

        if (!this.activeTutorialDocumentUri) {
            return;
        }

        const previousUri = this.activeTutorialDocumentUri;
        const document = vscode.workspace.textDocuments.find(
            candidate => candidate.uri.toString() === previousUri,
        );

        if (completed && document &&
            this.activeTutorialOriginalContents !== undefined) {
            await this.resetDocument(
                document,
                this.activeTutorialOriginalContents,
            );
            await this.closeTabs(this.findTabsForUri(previousUri), true);
        } else if (document && !document.isDirty) {
            await this.closeTabs(this.findTabsForUri(previousUri), false);
        }

        this.activeTutorialDocumentUri = undefined;
        this.activeTutorialOriginalContents = undefined;
    }

    createSnapshot(document, editor) {
        if (!document || !editor) {
            return undefined;
        }

        return {
            document: serializeDocument(document),
            contents: document.getText(),
            selections: editor.selections.map(serializeSelection),
            visibleRanges: editor.visibleRanges.map(serializeRange),
        };
    }

    async loadStep(message, webview) {
        const key = message.key;

        // Do not forward setup and cleanup events to the new exercise.
        this.activeEventTypes = new Set();
        await this.cleanUpStepBeforeLeaving(key);

        const step = this.parseStep(key, webview);
        const state = this.readCompletionState();
        this.currentStepKey = key;

        const shouldReset = message.restart === true || state[key] === true;

        const openResult = step.workspace
            ? await this.openWorkspaceStep(key, step, shouldReset)
            : await this.openStepDocument(key, step, shouldReset);

        /*
         * vscode.openFolder() restarts the extension host. Do not render an
         * error or an empty exercise while the window is switching.
         */
        if (openResult.reopeningWorkspace) {
            return;
        }

        const { document, editor } = openResult;

        this.updateActiveEventTypes(step.script);
        const snapshot = this.createSnapshot(document, editor);

        this.postMessage({
            command: "load_step_return",
            key,
            step,
            state,
            snapshot,
            workspaceRoot: this.activeTutorialRootUri
                ? this.serializeTutorialUri(this.activeTutorialRootUri)
                : undefined,
        });
    }

    resolveWebviewView(webviewView) {
        this.webviewView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri],
        };

        const htmlPath = vscode.Uri.joinPath(
            this.context.extensionUri,
            "media",
            "index.html",
        ).fsPath;
        let html = fs.readFileSync(htmlPath, "utf8");

        html = html.replace(
            "styles.css",
            webviewView.webview.asWebviewUri(
                vscode.Uri.joinPath(
                    this.context.extensionUri,
                    "media",
                    "styles.css",
                ),
            ),
        );
        html = html.replace(
            "script.js",
            webviewView.webview.asWebviewUri(
                vscode.Uri.joinPath(
                    this.context.extensionUri,
                    "media",
                    "script.js",
                ),
            ),
        );
        html = html.replace('"__SECTIONS__"', JSON.stringify(this.sections));
        webviewView.webview.html = html;

        webviewView.onDidDispose(() => {
            if (this.webviewView === webviewView) {
                this.webviewView = undefined;
            }
        });

        webviewView.webview.onDidReceiveMessage(async message => {
            try {
                if (message.command === "load_step") {
                    this.loadQueue = this.loadQueue.then(
                        () => this.loadStep(message, webviewView.webview),
                        () => this.loadStep(message, webviewView.webview),
                    );
                    await this.loadQueue;
                } else if (message.command === "mark_step_complete") {
                    this.markStepComplete(message.step);
                    this.postMessage({
                        command: "update_state",
                        state: this.readCompletionState(),
                    });
                } else if (message.command === "ready") {
                    const state = this.readCompletionState();
                    this.postMessage({ command: "update_state", state });

                    const pending =
                        this.context.globalState.get(
                            pendingWorkspaceStepStateKey,
                        );

                    const currentWorkspaceUri =
                        vscode.workspace.workspaceFolders?.[0]
                            ?.uri.toString();

                    let requestedStepKey;

                    if (
                        pending &&
                        pending.workspaceUri === currentWorkspaceUri
                    ) {
                        requestedStepKey = pending.key;
                        await this.context.globalState.update(
                            pendingWorkspaceStepStateKey,
                            undefined,
                        );
                    }

                    let firstStep = 0;
                    let index = 0;
                    let foundStep = false;

                    for (const section of this.sections.sections) {
                        for (const step of section.steps) {
                            const isRequestedStep =
                                requestedStepKey &&
                                step.key === requestedStepKey;

                            const isFirstIncompleteStep =
                                !requestedStepKey &&
                                !state[step.key];

                            if (
                                isRequestedStep ||
                                isFirstIncompleteStep
                            ) {
                                firstStep = index;
                                foundStep = true;
                                break;
                            }

                            index += 1;
                        }

                        if (foundStep) {
                            break;
                        }
                    }

                    this.postMessage({
                        command: "click_step",
                        step: firstStep,
                    });
                }
            } catch (error) {
                console.error(error);
                this.postMessage({
                    command: "show_error",
                    message: error instanceof Error
                        ? error.message
                        : String(error),
                });
            }
        });
    }
}

TutorialViewProvider.serializeDocument = serializeDocument;
TutorialViewProvider.serializePosition = serializePosition;
TutorialViewProvider.serializeRange = serializeRange;
TutorialViewProvider.serializeSelection = serializeSelection;
TutorialViewProvider.tabUri = tabUri;

module.exports = TutorialViewProvider;
