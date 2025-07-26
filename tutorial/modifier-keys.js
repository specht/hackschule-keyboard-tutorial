let table = document.querySelector('#table0');

table.insertAdjacentHTML('beforeend',
    `<td style='width: 1.2em;' id="s0">
    ${checkBox()}
    </td><td>Schritt 1: <key>Alt</key> drücken</td></tr>`);
table.insertAdjacentHTML('beforeend',
    `<td style='width: 1.2em;' id="s1">
    ${checkBox()}
    </td><td>Schritt 2: <key>Z</key> drücken</td></tr>`);
table.insertAdjacentHTML('beforeend',
    `<td style='width: 1.2em;' id="s2">
    ${checkBox()}
    </td><td>Schritt 3: <key>Z</key> loslassen</td></tr>`);
table.insertAdjacentHTML('beforeend',
    `<td style='width: 1.2em;' id="s3">
    ${checkBox()}
    </td><td>Schritt 4: <key>Alt</key> loslassen</td></tr>`);

table = document.querySelector('#table1');

table.insertAdjacentHTML('beforeend',
    `<td style='width: 1.2em;' id="t0">
    ${checkBox()}
    </td><td>Schritt 1: <key>Strg</key> und <key>Shift</key> drücken</td></tr>`);
table.insertAdjacentHTML('beforeend',
    `<td style='width: 1.2em;' id="t1">
    ${checkBox()}
    </td><td>Schritt 2: <key>C</key> drücken</td></tr>`);
table.insertAdjacentHTML('beforeend',
    `<td style='width: 1.2em;' id="t2">
    ${checkBox()}
    </td><td>Schritt 3: <key>C</key> loslassen</td></tr>`);
table.insertAdjacentHTML('beforeend',
    `<td style='width: 1.2em;' id="t3">
    ${checkBox()}
    </td><td>Schritt 4: <key>Strg</key> und <key>Shift</key> loslassen</td></tr>`);


const catcher = document.querySelector('#key_catcher');

var i0 = 0;
var i1 = 0;
var mod_keys = {'control': false, 'alt': false, 'shift': false};

document.addEventListener('click', function() {
    catcher.focus({ preventScroll: true });
});

catcher.addEventListener('beforeinput', function (e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
});

catcher.addEventListener('keydown', function (e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    mod_keys[e.key.toLowerCase()] = true;
    if (!e.repeat) handleKey(e.key.toLowerCase(), 'down');
});

catcher.addEventListener('keyup', function (e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    mod_keys[e.key.toLowerCase()] = false;
    handleKey(e.key.toLowerCase(), 'up');
});

function handleKey(key, dir) {
    if (i0 === 0) {
        i0 = (key === 'alt' && dir === 'down') ? 1 : 0;
    } else if (i0 === 1) {
        i0 = (key === 'z' && dir === 'down') ? 2 : 0;
    } else if (i0 === 2) {
        i0 = (key === 'z' && dir === 'up') ? 3 : 0;
    } else if (i0 === 3) {
        i0 = (key === 'alt' && dir === 'up') ? 4 : 0;
    } else if (i0 === 4) {
        i0 = (key === 'alt' && dir === 'down') ? 1 : i0;
    }
    if (i1 === 0) {
        i1 = (dir === 'down' && mod_keys.control && mod_keys.shift) ? 1 : 0;
    } else if (i1 === 1) {
        i1 = (key === 'c' && dir === 'down') ? 2 : 0;
    } else if (i1 === 2) {
        i1 = (key === 'c' && dir === 'up') ? 3 : 0;
    } else if (i1 === 3) {
        if (key === 'control' || key === 'shift') {
            if (dir === 'up' && !mod_keys.control && !mod_keys.shift) i1 = 4;
        } else {
            i1 = 0;
        }
    } else if (i1 === 4) {
        i1 = (dir === 'down' && mod_keys.control && mod_keys.shift) ? 1 : i1;
    }
    updateSolved();
}

document.querySelector('#key_catcher').focus();

function updateSolved() {
    for (let i = 0; i < 4; i++) {
        let check = document.querySelector(`#s${i} .check`);
        if (i < i0)
            check.classList.add('checked');
        else
            check.classList.remove('checked');
    }
    for (let i = 0; i < 4; i++) {
        let check = document.querySelector(`#t${i} .check`);
        if (i < i1)
            check.classList.add('checked');
        else
            check.classList.remove('checked');
    }
    if (i0 === 4 && i1 === 4) markTaskComplete();
}