const vscode = acquireVsCodeApi();

// Send a message TO the Extension
function sendMessage() {
    vscode.postMessage({
        command: 'log',
        text: 'Hello from the webview!'
    });
}

// Receive messages FROM the Extension
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'load_step_return':
            document.querySelector('#instruction').innerHTML = message.step.instruction;
            eval(message.step.script ?? '');
            document.querySelector('#bu_next').disabled = true;
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
}

function clickStep(n) {
    stepIndex = n;
    updateToc();

    vscode.postMessage({
        command: 'load_step',
        key: stepOrder[stepIndex],
    });
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
            <td>
                <span class="circle">
                    <svg class="icon"><use href="#circle-dotted"></use></svg>
                </span>
            </td>
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
            <tr data-type='step' data-step-index='${stepOrder.length - 1}' data-section-index='${nr - 1}'>
                <td></td>
                <td style="width: 0.5em;">&ndash;</td>
                <td>${step.heading}</td>
                <td>
                    <span class="circle">
                        <svg class="icon"><use href="#circle-dotted"></use></svg>
                    </span>
                </td>
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
    clickStep(0);
});