const vscode = require("vscode");
const path = require("path");
const fs = require("fs/promises");
const os = require("os");
const yaml = require("yaml");

const TutorialViewProvider = require("./TutorialViewProvider");

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
    // return;
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

    // for (const group of vscode.window.tabGroups.all) {
    //     console.log('Group', group);
    //     for (const tab of group.tabs) {
    //         console.log('Tab', tab, 'URI', tab.input.uri.toString());
    //         // if (tab.input && tab.input.uri.toString() === uri.toString()) {
    //         //     await vscode.window.tabGroups.close(tab);
    //         // }
    //     }
    // }
}

function deactivate() { }

module.exports = { activate, deactivate };
