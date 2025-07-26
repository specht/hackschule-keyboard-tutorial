const vscode = require("vscode");
const path = require("path");
const fs = require("fs/promises");
const os = require("os");
const yaml = require("yaml");
let provider = null;

const TutorialViewProvider = require("./TutorialViewProvider");

function watchUserActivity(context) {
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            provider.webviewView.webview.postMessage({ command: 'onDidChangeTextDocument', event: event });
        }),

        vscode.workspace.onDidSaveTextDocument((event) => {
            provider.webviewView.webview.postMessage({ command: 'onDidSaveTextDocument', event: event });
        }),

        vscode.window.onDidChangeTextEditorSelection((event) => {
            provider.webviewView.webview.postMessage({ command: 'onDidChangeTextEditorSelection', event: event });
        }),

        vscode.window.onDidChangeActiveTextEditor((event) => {
            provider.webviewView.webview.postMessage({ command: 'onDidChangeActiveTextEditor', event: event });
        }),

        vscode.window.onDidChangeTextEditorOptions((event) => {
            provider.webviewView.webview.postMessage({ command: 'onDidChangeTextEditorOptions', event: event });
        }),

        vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
            provider.webviewView.webview.postMessage({ command: 'onDidChangeTextEditorVisibleRanges', event: event });
        }),
    );
}

async function activate(context) {
    // return;
    const file = await fs.readFile(vscode.Uri.joinPath(context.extensionUri, "tutorial", "sections.yaml").fsPath, 'utf8');
    const sections = yaml.parse(file);
    provider = new TutorialViewProvider(context, sections);

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
