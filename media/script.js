const vscode = acquireVsCodeApi();
let state = {};

function nop(e) { console.log(e); }

let handleOnDidChangeTextDocument = nop;
let handleOnDidSaveTextDocument = nop;
let handleOnDidChangeTextEditorSelection = nop;
let handleOnDidChangeActiveTextEditor = nop;
let handleOnDidChangeTextEditorOptions = nop;
let handleOnDidChangeTextEditorVisibleRanges = nop;
let markedAsComplete = false;

// Send a message TO the Extension
// Receive messages FROM the Extension
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'load_step_return':
            document.querySelector('#instruction').innerHTML = message.step.instruction;
            eval(message.step.script ?? '');
            document.querySelector('#bu_next').disabled = true;
            state = message.state;
            updateToc();
            break;
        case 'update_state':
            state = message.state;
            console.log('RECEIVED STATE', state);
            updateToc();
            break;
        case 'click_step':
            clickStep(message.step);
            break;
        case 'onDidChangeTextDocument':
            handleOnDidChangeTextDocument(message.event);
            break;
        case 'onDidSaveTextDocument':
            handleOnDidSaveTextDocument(message.event);
            break;
        case 'onDidChangeTextEditorSelection':
            handleOnDidChangeTextEditorSelection(message.event);
            break;
        case 'onDidChangeActiveTextEditor':
            handleOnDidChangeActiveTextEditor(message.event);
            break;
        case 'onDidChangeTextEditorOptions':
            handleOnDidChangeTextEditorOptions(message.event);
            break;
        case 'onDidChangeTextEditorVisibleRanges':
            handleOnDidChangeTextEditorVisibleRanges(message.event);
            break;
        }
});

function updateToc() {
    for (let el of document.querySelectorAll('tr[data-type="section"]'))
        el.classList.remove('active');
    for (let el of document.querySelectorAll('tr[data-type="step"]'))
        el.classList.remove('active');

    for (let el of document.querySelectorAll('tr[data-type="step"]'))
        el.style.display = 'none';
    for (let el of document.querySelectorAll(`tr[data-type="step"][data-section-index="${stepSection[stepIndex]}"]`))
        el.style.display = '';
    document.querySelector(`tr[data-type="step"][data-step-index="${stepIndex}"]`).classList.add('active');

    let sectionUnsolved = {};
    let maxSection = 0;

    for (let i = 0; i < stepOrder.length; i++) {
        if (stepSection[i] > maxSection) maxSection = stepSection[i];
        let check = document.querySelector(`tr[data-type="step"][data-step-key="${stepOrder[i]}"] .check`);
        if (state[stepOrder[i]]) {
            check.classList.add('checked');
        } else {
            check.classList.remove('checked');
            sectionUnsolved[stepSection[i]] = true;
        }
    }
    for (let i = 0; i <= maxSection; i++) {
        let check = document.querySelector(`tr[data-type="section"][data-section-index="${i}"] .check`);
        if (sectionUnsolved[i]) {
            check.classList.remove('checked');
        } else {
            check.classList.add('checked');
        }
    }
}

function markTaskComplete() {
    if (markedAsComplete) return;

    vscode.postMessage({
        command: 'mark_step_complete',
        step: stepOrder[stepIndex],
    });

    if (stepIndex < stepOrder.length - 1) {
        document.querySelector('#bu_next').disabled = false;
    }
    markedAsComplete = true;
}

function clickStep(n) {
    stepIndex = n;
    stepIndex = parseInt(`${stepIndex}`);
    updateToc();
    handleOnDidChangeTextDocument = nop;
    handleOnDidSaveTextDocument = nop;
    handleOnDidChangeTextEditorSelection = nop;
    handleOnDidChangeActiveTextEditor = nop;
    handleOnDidChangeTextEditorOptions = nop;
    handleOnDidChangeTextEditorVisibleRanges = nop;
    markedAsComplete = false;

    vscode.postMessage({
        command: 'load_step',
        key: stepOrder[stepIndex],
    });
}

function clickNextStep() {
    stepIndex = parseInt(`${stepIndex}`);
    stepIndex = (stepIndex + 1) % stepOrder.length;
    clickStep(stepIndex);
}

function clickSection(n) {
    if (firstStepForSection[n] === null) return;
    clickStep(firstStepForSection[n])
}

window.addEventListener('DOMContentLoaded', function () {
    let nr = 0;
    const tbody = document.querySelector("table.toc tbody");
    for (let section of sections.sections) {
        console.log("Inserting section", section);
        nr += 1;

        tbody.insertAdjacentHTML("beforeend", `
        <tr data-type='section' data-section-index='${nr - 1}'>
            <td>${nr}.</td>
            <td colspan="2">${section.heading}</td>
            <td>${checkBox()}</td>
        </tr>
        `);
        firstStepForSection.push(null);
        for (let step of section.steps) {
            if (firstStepForSection[firstStepForSection.length - 1] === null) {
                firstStepForSection[firstStepForSection.length - 1] = stepOrder.length;
            }
            stepOrder.push(step.key);
            stepSection.push(nr - 1);
            tbody.insertAdjacentHTML("beforeend", `
            <tr data-type='step' data-step-index='${stepOrder.length - 1}' data-step-key='${step.key}' data-section-index='${nr - 1}'>
                <td></td>
                <td style="width: 0.5em;">&ndash;</td>
                <td>${step.heading}</td>
                <td>${checkBox()}</td>
            </tr>
            `);

        }
    }
    tbody.addEventListener('click', (e) => {
        let row = e.target.closest('tr[data-type="section"]');
        if (row) {
            clickSection(row.dataset.sectionIndex);
        }
        row = e.target.closest('tr[data-type="step"]');
        if (row) {
            clickStep(row.dataset.stepIndex);
        }
    });
    updateToc();
    vscode.postMessage({ command: 'ready'});
});

function checkBox(id) {
    return `<span id='${id}' class='check'><svg class="icon"><use href="#circle-dotted"></use></svg><svg class="icon"><use href="#check"></use></svg></span>`;
}