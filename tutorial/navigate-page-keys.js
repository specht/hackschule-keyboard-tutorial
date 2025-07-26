handleOnDidChangeTextEditorSelection = function(e) {
    let s = e.selections[0];
    if (s.start.line >= 1326 && s.start.line <= 1328 &&
        s.end.line === s.start.line && s.end.character === s.start.character) {
        markTaskComplete();
    }
}
