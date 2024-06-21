
# PEG parser outline

## Sample language
```
MathExpr = node:(ExprSum / ExprMul / Value)
OpSum = '+' / '-'
OpMul = '*' / '/'
ExprSum = left:(ExprMul / Value) op:OpSum right:(ExprSum / ExprMul / Value)
ExprMul = left:Value op:OpMul right:(ExprMul / Value)

Number = [0-9]+
BracketValue = '(' MathExpr ')'
Value = Number / BracketValue
```

## Sample language parser
```
Program = def:(Terminal / NonTerminal) '\n' next: (Program / EOL)

Terminal = name:Word '=' expr:(TerminalOr / TerminalStr)
TerminalRange = '[' start:Char '-' end:Char ']'
TerminalRepeat = expr:(TerminalRange / TerminalStr) type:('*' / '+')
TerminalStr = '\'' str:Word '\''
TerminalOr = left:TerminalStr '/' right:(TerminalOr / TerminalStr)

Word = [a-zA-Z]+
Char = [a-zA-Z]

```


1 + 2 * 3 + 4 = 1 + ((2*3) + 4)

- no * or + operator for NonTerminals (only for terminals). Recursion makes for
  better ASTs.
- For any position we store "this position can be parsed as a X-NonTerminal". We
  don't store the actual non-terminal. Iterating through the parsetree happens
    dynamically.
- When updating the source, we delete all "results" in the range of the parent
node and try again.
