const vscode = require("vscode");
const fs = require("fs");
const yaml = require("yaml");
const os = require("os");
const path = require("path");

const tutorialDir = path.join(os.homedir(), ".hs-kbd-tutorial");

class TutorialViewProvider {
    constructor(context, sections) {
        this.context = context;
        this.sections = sections;
    }

    readCompletionState() {
        let state = {};
        for (let section of this.sections.sections) {
            for (let step of section.steps) {
                let key = step.key;
                state[key] = false;
            }
        }
        fs.mkdirSync(tutorialDir, { recursive: true });
        const stateFilePath = path.join(tutorialDir, '.state.json');
        if (fs.existsSync(stateFilePath)) {
            try {
                let data = JSON.parse(fs.readFileSync(stateFilePath));
                for (let key in data) {
                    if (key in state) {
                        state[key] = data[key];
                    }
                }
            } catch {
            }
        }
        // fs.writeFileSync(stateFilePath, JSON.stringify(state), "utf8");
        return state;
    }

    writeCompletionState(state) {
        fs.mkdirSync(tutorialDir, { recursive: true });
        const stateFilePath = path.join(tutorialDir, '.state.json');
        fs.writeFileSync(stateFilePath, JSON.stringify(state), "utf8");
    }

    markStepComplete(step) {
        let state = this.readCompletionState();
        state[step] = true;
        this.writeCompletionState(state);
    }

    resolveWebviewView(webviewView, context, token) {
        this.webviewView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri],
        };

        const htmlPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'index.html').fsPath;
        let html = fs.readFileSync(htmlPath, 'utf8');

        html = html.replace('styles.css', webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'styles.css')));
        html = html.replace('script.js', webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'script.js')));
        html = html.replace('"__SECTIONS__"', JSON.stringify(this.sections));
        webviewView.webview.html = html;

        webviewView.webview.onDidReceiveMessage(async message => {
            // console.log(`Message from webview: ${JSON.stringify(message)}`);
            if (message.command === 'load_step') {
                // console.log(`Loading step: ${message.key}`)
                let step = {};
                let yamlPath = vscode.Uri.joinPath(this.context.extensionUri, "tutorial", `${message.key}.yaml`).fsPath;
                let htmlPath = vscode.Uri.joinPath(this.context.extensionUri, "tutorial", `${message.key}.html`).fsPath;
                if (fs.existsSync(htmlPath)) {
                    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

                    const yamlMatch = htmlContent.match(/<yaml>([\s\S]*?)<\/yaml>/i);
                    if (yamlMatch) {
                        step = yaml.parse(yamlMatch[1].trim()) ?? {};
                        htmlContent = htmlContent.replace(yamlMatch[0], "");
                    }

                    const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/i);
                    if (scriptMatch) {
                        step.script = scriptMatch[1].trim(); // just the JS code inside
                        htmlContent = htmlContent.replace(scriptMatch[0], "");
                    }

                    step.instruction = htmlContent.trim();
                }
                if (step.file) {
                    let filePath = vscode.Uri.joinPath(this.context.extensionUri, step.file).fsPath;
                    let contents = fs.readFileSync(filePath, 'utf8');
                    let baseName = path.basename(filePath);
                    fs.mkdirSync(tutorialDir, { recursive: true });
                    const tempFilePath = path.join(tutorialDir, baseName);

                    let tempDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === tempFilePath);
                    if (tempDoc && tempDoc.isDirty) {
                        await tempDoc.save();
                    }

                    fs.writeFileSync(tempFilePath, contents, "utf8");

                    let doc = await vscode.workspace.openTextDocument(tempFilePath);
                    await vscode.window.showTextDocument(doc, { preview: false });
                    if (step.cursor) {
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            const position = new vscode.Position(step.cursor[0] - 1, step.cursor[1] - 1);
                            editor.selection = await new vscode.Selection(position, position);
                            await editor.revealRange(new vscode.Range(position, position), step.cursor[2] === 'top' ? vscode.TextEditorRevealType.AtTop : vscode.TextEditorRevealType.InCenter);
                        }
                    }
                    if (step.scrollY) {
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            const position = new vscode.Position(step.scrollY - 1, 0);
                            await editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
                        }
                    }
                    // await vscode.workspace.getConfiguration("editor", doc.uri).update(
                    //     "wordWrap", "off", vscode.ConfigurationTarget.Global
                    // );

                }
                let state = this.readCompletionState();
                webviewView.webview.postMessage({ command: 'load_step_return', step: step, state: state });
            } else if (message.command === 'mark_step_complete') {
                let step = message.step;
                this.markStepComplete(step);
                let state = this.readCompletionState();
                webviewView.webview.postMessage({ command: 'update_state', state: state });
            } else if (message.command === 'ready') {
                let state = this.readCompletionState();
                webviewView.webview.postMessage({ command: 'update_state', state: state });
                let firstStep = null;
                let i = 0;
                for (let section of this.sections.sections) {
                    for (let step of section.steps) {
                        let key = step.key;
                        if (!state[key]) {
                            firstStep = i;
                            break;
                        }
                        i += 1;
                    }
                    if (firstStep !== null) break;
                }
                if (firstStep === null) firstStep = 0;
                webviewView.webview.postMessage({ command: 'click_step', step: firstStep });
            }
        });
    }
}

module.exports = TutorialViewProvider;
