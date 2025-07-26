const vscode = require("vscode");
const fs = require("fs");
const yaml = require("yaml");
const os = require("os");
const path = require("path");

class TutorialViewProvider {
    constructor(context, sections) {
        this.context = context;
        this.sections = sections;
    }

    resolveWebviewView(webviewView, context, token) {
        this.webviewView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri],
        };

        let html = this.getHtmlForWebview(webviewView.webview);
        html = html.replace('styles.css', webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'styles.css')));
        html = html.replace('script.js', webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'script.js')));
        html = html.replace('"__SECTIONS__"', JSON.stringify(this.sections));
        webviewView.webview.html = html;

        webviewView.webview.onDidReceiveMessage(async message => {
            console.log(`Message from webview: ${JSON.stringify(message)}`);
            if (message.command === 'load_step') {
                console.log(`Loading step: ${message.key}`)
                let step = {};
                let yamlPath = vscode.Uri.joinPath(this.context.extensionUri, "tutorial", `${message.key}.yaml`).fsPath;
                if (fs.existsSync(yamlPath)) {
                    step = yaml.parse(fs.readFileSync(yamlPath, 'utf8')) ?? {};
                }
                let htmlPath = vscode.Uri.joinPath(this.context.extensionUri, "tutorial", `${message.key}.html`).fsPath;
                if (fs.existsSync(htmlPath)) {
                    step.instruction = fs.readFileSync(htmlPath, 'utf8');
                }
                let scriptPath = vscode.Uri.joinPath(this.context.extensionUri, "tutorial", `${message.key}.js`).fsPath;
                if (fs.existsSync(scriptPath)) {
                    step.script = fs.readFileSync(scriptPath, 'utf8');
                }
                if (step.file) {
                    let filePath = vscode.Uri.joinPath(this.context.extensionUri, step.file).fsPath;
                    console.log('filePath', filePath);
                    let contents = fs.readFileSync(filePath, 'utf8');
                    let baseName = path.basename(filePath);
                    console.log('baseName', baseName);
                    let dir = path.join(os.homedir(), ".hs-kbd-tutorial");
                    fs.mkdirSync(dir, {recursive: true});
                    const tempFilePath = path.join(dir, baseName);
                    fs.writeFileSync(tempFilePath, contents, "utf8");
                    // const doc = vscode.workspace.openTextDocument(tempFilePath);
                    let doc = await vscode.workspace.openTextDocument(tempFilePath);
                    await vscode.window.showTextDocument(doc, { preview: false });
                    if (step.cursor) {
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            const position = new vscode.Position(step.cursor[0] - 1, step.cursor[1]); // line 10, character 5 (0-based)
                            editor.selection = new vscode.Selection(position, position);
                            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
                        }
                    }
                    // await vscode.workspace.getConfiguration("editor", doc.uri).update(
                    //     "wordWrap", "off", vscode.ConfigurationTarget.Global
                    // );

                }
                webviewView.webview.postMessage({ command: 'load_step_return', step: step });
            }
        });

        webviewView.webview.postMessage({ command: 'setTitle', text: 'Welcome!' });

    }

    getHtmlForWebview(webview) {
        const htmlPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'index.html').fsPath;
        return fs.readFileSync(htmlPath, 'utf8');
    }
}

module.exports = TutorialViewProvider;
