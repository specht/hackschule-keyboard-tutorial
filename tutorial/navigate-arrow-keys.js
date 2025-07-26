handleOnDidChangeTextEditorSelection = function(e) {
    let s = e.selections[0];
    if (s.start.line === 18 && s.start.character === 23 &&
        s.end.line === s.start.line && s.end.character === s.start.character) {
        markTaskComplete();
    }
}
