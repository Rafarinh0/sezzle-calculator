package calc

import (
	"errors"
	"math"
	"testing"
)

func TestCalculate(t *testing.T) {
	tests := []struct {
		op       string
		operands []float64
		want     float64
	}{
		{"add", []float64{2, 3}, 5},
		{"add", []float64{0.1, 0.2}, 0.3}, // no 0.30000000000000004
		{"add", []float64{-1.5, 1.5}, 0},
		{"subtract", []float64{10, 4}, 6},
		{"subtract", []float64{0.3, 0.1}, 0.2},
		{"multiply", []float64{6, 7}, 42},
		{"multiply", []float64{-3, 0}, 0}, // -0 normalized
		{"divide", []float64{10, 4}, 2.5},
		{"divide", []float64{1, 3}, 0.333333333333333},
		{"divide", []float64{-9, 3}, -3},
		{"power", []float64{2, 10}, 1024},
		{"power", []float64{2, -1}, 0.5},
		{"power", []float64{9, 0.5}, 3},
		{"power", []float64{-2, 3}, -8},
		{"power", []float64{0, 0}, 1},
		{"sqrt", []float64{16}, 4},
		{"sqrt", []float64{2}, 1.4142135623731},
		{"sqrt", []float64{0}, 0},
		{"percentage", []float64{10, 50}, 5},
		{"percentage", []float64{25, 1}, 0.25},
		{"percentage", []float64{-20, 80}, -16},
		{"percentage", []float64{1e307, 200}, 2e307},                 // the product overflows; the result doesn't
		{"multiply", []float64{math.MaxFloat64, 1}, math.MaxFloat64}, // rounding to 15 digits would overflow
	}
	for _, tt := range tests {
		got, err := Calculate(tt.op, tt.operands)
		if err != nil {
			t.Errorf("%s%v: unexpected error %v", tt.op, tt.operands, err)
			continue
		}
		if got != tt.want || math.Signbit(got) != math.Signbit(tt.want) {
			t.Errorf("%s%v = %v, want %v", tt.op, tt.operands, got, tt.want)
		}
	}
}

func TestCalculateErrors(t *testing.T) {
	tests := []struct {
		op       string
		operands []float64
		want     error
	}{
		{"divide", []float64{1, 0}, ErrDivisionByZero},
		{"divide", []float64{0, 0}, ErrDivisionByZero},
		{"power", []float64{0, -1}, ErrDivisionByZero},
		{"power", []float64{-8, 0.5}, ErrNotReal},
		{"power", []float64{10, 400}, ErrOverflow},
		{"multiply", []float64{1e308, 10}, ErrOverflow},
		{"add", []float64{math.MaxFloat64, math.MaxFloat64}, ErrOverflow},
		{"sqrt", []float64{-4}, ErrNegativeRoot},
		{"modulo", []float64{1, 2}, ErrUnknownOperation},
		{"", nil, ErrUnknownOperation},
		{"add", []float64{1}, ErrOperandCount},
		{"add", nil, ErrOperandCount},
		{"sqrt", []float64{4, 2}, ErrOperandCount},
	}
	for _, tt := range tests {
		_, err := Calculate(tt.op, tt.operands)
		if !errors.Is(err, tt.want) {
			t.Errorf("%s%v: error %v, want %v", tt.op, tt.operands, err, tt.want)
		}
	}
}

func TestMathErrorsAreMathError(t *testing.T) {
	for _, err := range []error{ErrDivisionByZero, ErrNegativeRoot, ErrNotReal, ErrOverflow} {
		var m *MathError
		if !errors.As(err, &m) {
			t.Errorf("%v is not a *MathError", err)
		}
	}
	if got := ErrDivisionByZero.Error(); got != "cannot divide by zero" {
		t.Errorf("message = %q", got)
	}
}

func TestOperations(t *testing.T) {
	want := []string{"add", "divide", "multiply", "percentage", "power", "sqrt", "subtract"}
	got := Operations()
	if len(got) != len(want) {
		t.Fatalf("Operations() = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("Operations() = %v, want %v", got, want)
		}
	}
}
