function renderCalculator() {
    const display = document.getElementById("calculatorDisplay");
    const subdisplay = document.getElementById("calculatorSubdisplay");
    if (!display || !subdisplay) return;
    display.value = calculatorState.displayValue || "0";
    subdisplay.textContent = calculatorState.previousExpression || calculatorState.expression || "";
}

function normalizeCalculatorExpression(expr) {
    return String(expr || "").replace(/\s+/g, "");
}

function getLastCalculatorOperand(expr) {
    const match = normalizeCalculatorExpression(expr).match(/-?\d*\.?\d+$/);
    return match ? match[0] : "";
}

function setCalculatorError() {
    calculatorState.expression = "";
    calculatorState.displayValue = "Error";
    calculatorState.justEvaluated = true;
}

function appendCalculatorDigit(digit) {
    if (calculatorState.justEvaluated) {
        calculatorState.expression = "";
        calculatorState.previousExpression = "";
        calculatorState.justEvaluated = false;
    }
    const nextExpression = `${calculatorState.expression}${digit}`;
    calculatorState.expression = nextExpression;
    calculatorState.displayValue = getLastCalculatorOperand(nextExpression) || digit;
}

function appendCalculatorDecimal() {
    if (calculatorState.justEvaluated) {
        calculatorState.expression = "";
        calculatorState.previousExpression = "";
        calculatorState.justEvaluated = false;
    }

    const normalized = normalizeCalculatorExpression(calculatorState.expression);
    const lastOperand = getLastCalculatorOperand(normalized);
    if (lastOperand.includes(".")) return;

    if (!normalized || /[+\-*/]$/.test(normalized)) {
        calculatorState.expression = `${normalized}0.`;
        calculatorState.displayValue = "0.";
        return;
    }

    calculatorState.expression = `${normalized}.`;
    calculatorState.displayValue = `${lastOperand}.`;
}

function appendCalculatorOperator(operator) {
    const normalized = normalizeCalculatorExpression(calculatorState.expression);
    if (!normalized) {
        if (operator === "-") {
            calculatorState.expression = "-";
            calculatorState.displayValue = "-";
        }
        return;
    }

    if (calculatorState.justEvaluated) {
        calculatorState.justEvaluated = false;
    }

    if (/[+\-*/]$/.test(normalized)) {
        calculatorState.expression = `${normalized.slice(0, -1)}${operator}`;
        return;
    }

    calculatorState.expression = `${normalized}${operator}`;
}

function toggleCalculatorSign() {
    const normalized = normalizeCalculatorExpression(calculatorState.expression);
    if (!normalized) {
        calculatorState.expression = "-";
        calculatorState.displayValue = "-";
        return;
    }

    const match = normalized.match(/-?\d*\.?\d+$/);
    if (!match) return;

    const operand = match[0];
    const operandIndex = normalized.lastIndexOf(operand);
    const toggled = operand.startsWith("-") ? operand.slice(1) : `-${operand}`;
    calculatorState.expression = `${normalized.slice(0, operandIndex)}${toggled}`;
    calculatorState.displayValue = toggled;
}

function backspaceCalculator() {
    if (calculatorState.justEvaluated) {
        calculatorState.expression = "";
        calculatorState.displayValue = "0";
        calculatorState.previousExpression = "";
        calculatorState.justEvaluated = false;
        return;
    }

    const nextExpression = normalizeCalculatorExpression(calculatorState.expression).slice(0, -1);
    calculatorState.expression = nextExpression;
    if (!nextExpression) {
        calculatorState.displayValue = "0";
        return;
    }

    const lastOperand = getLastCalculatorOperand(nextExpression);
    calculatorState.displayValue = lastOperand || nextExpression.slice(-1);
}

function clearCalculator() {
    calculatorState.expression = "";
    calculatorState.displayValue = "0";
    calculatorState.justEvaluated = false;
    calculatorState.previousExpression = "";
}

function evaluateCalculator() {
    const expression = normalizeCalculatorExpression(calculatorState.expression);
    if (!expression || /[+\-*/.]$/.test(expression)) {
        return;
    }
    if (!/^[0-9+\-*/.]+$/.test(expression)) {
        setCalculatorError();
        return;
    }

    try {
        // The calculator only permits a tightly filtered arithmetic grammar before evaluation.
        const result = Function(`"use strict"; return (${expression});`)();
        if (typeof result !== "number" || !Number.isFinite(result)) {
            setCalculatorError();
            return;
        }
        const formatted = Number.isInteger(result) ? String(result) : String(Number(result.toFixed(8)));
        calculatorState.previousExpression = `${expression} =`;
        calculatorState.expression = formatted;
        calculatorState.displayValue = formatted;
        calculatorState.justEvaluated = true;
    } catch (err) {
        setCalculatorError();
    }
}

function handleCalculatorAction(action, value = "") {
    switch (action) {
    case "digit":
        appendCalculatorDigit(value);
        break;
    case "decimal":
        appendCalculatorDecimal();
        break;
    case "operator":
        appendCalculatorOperator(value);
        break;
    case "toggle-sign":
        toggleCalculatorSign();
        break;
    case "backspace":
        backspaceCalculator();
        break;
    case "clear":
        clearCalculator();
        break;
    case "equals":
        evaluateCalculator();
        break;
    default:
        return;
    }
    renderCalculator();
}
