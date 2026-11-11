// Package calc implements the calculator's arithmetic, independent of HTTP.
package calc

import (
	"errors"
	"fmt"
	"maps"
	"math"
	"slices"
	"strconv"
	"strings"
)

// ErrUnknownOperation is returned for an operation name that isn't supported.
var ErrUnknownOperation = errors.New("unknown operation")

// ErrOperandCount is returned when an operation gets the wrong number of operands.
var ErrOperandCount = errors.New("wrong number of operands")

// MathError means the input was well-formed but has no finite real answer.
type MathError struct{ msg string }

func (e *MathError) Error() string { return e.msg }

// Math errors, returned as-is so callers can compare with errors.Is.
var (
	ErrDivisionByZero = &MathError{"cannot divide by zero"}
	ErrNegativeRoot   = &MathError{"cannot take the square root of a negative number"}
	ErrNotReal        = &MathError{"result is not a real number"}
	ErrOverflow       = &MathError{"result is too large"}
)

type operation struct {
	arity int
	apply func(x []float64) (float64, error)
}

var operations = map[string]operation{
	"add":      {2, func(x []float64) (float64, error) { return x[0] + x[1], nil }},
	"subtract": {2, func(x []float64) (float64, error) { return x[0] - x[1], nil }},
	"multiply": {2, func(x []float64) (float64, error) { return x[0] * x[1], nil }},
	"divide": {2, func(x []float64) (float64, error) {
		if x[1] == 0 {
			return 0, ErrDivisionByZero
		}
		return x[0] / x[1], nil
	}},
	"power": {2, func(x []float64) (float64, error) {
		if x[0] == 0 && x[1] < 0 {
			return 0, ErrDivisionByZero // 0^-n = 1/0^n
		}
		return math.Pow(x[0], x[1]), nil
	}},
	"sqrt": {1, func(x []float64) (float64, error) {
		if x[0] < 0 {
			return 0, ErrNegativeRoot
		}
		return math.Sqrt(x[0]), nil
	}},
	// percentage(a, b) is "a percent of b": percentage(10, 50) = 5.
	"percentage": {2, func(x []float64) (float64, error) { return x[0] * x[1] / 100, nil }},
}

// Operations lists the supported operation names in alphabetical order.
func Operations() []string {
	return slices.Sorted(maps.Keys(operations))
}

// Calculate runs the named operation on operands. Errors are ErrUnknownOperation,
// ErrOperandCount (both wrapped with detail) or a *MathError.
func Calculate(name string, operands []float64) (float64, error) {
	op, ok := operations[name]
	if !ok {
		return 0, fmt.Errorf("%w %q (supported: %s)", ErrUnknownOperation, name, strings.Join(Operations(), ", "))
	}
	if len(operands) != op.arity {
		return 0, fmt.Errorf("%w: %s takes %d, got %d", ErrOperandCount, name, op.arity, len(operands))
	}
	r, err := op.apply(operands)
	if err != nil {
		return 0, err
	}
	r = round(r)
	switch {
	case math.IsNaN(r):
		return 0, ErrNotReal // e.g. (-8)^0.5
	case math.IsInf(r, 0):
		return 0, ErrOverflow // e.g. 1e308 * 10
	}
	return r, nil
}

// round keeps 15 significant digits, the most a float64 holds exactly in
// decimal, so binary noise like 0.1+0.2 = 0.30000000000000004 never reaches
// the client. It also turns -0 into 0.
// ponytail: float64 with display rounding; switch to math/big or a decimal
// type if the calculator ever needs exact decimal arithmetic (money).
func round(x float64) float64 {
	r, _ := strconv.ParseFloat(strconv.FormatFloat(x, 'g', 15, 64), 64)
	if r == 0 {
		return 0
	}
	return r
}
