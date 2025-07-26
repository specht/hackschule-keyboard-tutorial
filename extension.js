const vscode = require("vscode");
const path = require("path");
const fs = require("fs/promises");
const os = require("os");
const yaml = require("yaml");

const TutorialViewProvider = require("./src/TutorialViewProvider");

class StepContentProvider {
    provideTextDocumentContent(uri) {
        return "Type this and comment it using the keyboard shortcut.";
    }
}

async function openTemporaryFileWithContent(content, extension = ".txt") {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "keyboard-tutorial-"));
    const tempFilePath = path.join(tempDir, "tutorial" + extension);

    await fs.writeFile(tempFilePath, content, "utf8");

    const doc = await vscode.workspace.openTextDocument(tempFilePath);
    await vscode.window.showTextDocument(doc, { preview: false });

    return {
        path: tempFilePath,
        cleanup: async () => {
            try {
                await fs.unlink(tempFilePath); // delete file
                await fs.rmdir(tempDir); // remove dir
            } catch (err) {
                console.error("Failed to clean up temp file:", err);
            }
        }
    };
}

async function openStepAsUntitled(content, language = "plaintext") {
    const doc = await vscode.workspace.openTextDocument({
        content,
        language, // e.g. 'plaintext', 'javascript', 'markdown'
    });

    await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    const uri = doc.uri;
    console.log('URI:', uri);
    return uri;
}

async function openFirstStepFile(context) {
    const fileUri = vscode.Uri.joinPath(context.extensionUri, "tutorial", "step-01.js");
    const content = fs.readFileSync(fileUri.fsPath, "utf-8");

    return openStepAsUntitled(content, 'javascript');
}

function watchUserActivity(context) {
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            console.log("User edited the text:", event.contentChanges);
        }),

        vscode.window.onDidChangeTextEditorSelection((event) => {
            const pos = event.selections[0].active;
            console.log(`Cursor moved to line ${pos.line}, char ${pos.character}`);
        })

    );
}


async function activate(context) {
    const file = await fs.readFile(vscode.Uri.joinPath(context.extensionUri, "tutorial", "sections.yaml").fsPath, 'utf8');
    const sections = yaml.parse(file);
    const provider = new TutorialViewProvider(context, sections);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("typingSteps", provider)
    );

    console.log("Extension activated");

    watchUserActivity(context);
    // vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    // focusSideBar
    // focusPanel

// const editor = vscode.window.activeTextEditor;
// if (editor && editor.document.isUntitled) {
//   // Revert the document silently
//   await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
// }    

    for (const group of vscode.window.tabGroups.all) {
        console.log('Group', group);
        for (const tab of group.tabs) {
            console.log('Tab', tab, 'URI', tab.input.uri.toString());
            // if (tab.input && tab.input.uri.toString() === uri.toString()) {
            //     await vscode.window.tabGroups.close(tab);
            // }
        }
    }
}

function deactivate() { }

module.exports = { activate, deactivate };
