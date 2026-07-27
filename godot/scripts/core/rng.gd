class_name Rng
extends RefCounted

## Aleatoriedad determinista: toda la generación procedural depende de una
## semilla, así una misma semilla reproduce exactamente la misma partida.
##
## Se porta el generador propio en vez de usar RandomNumberGenerator de Godot
## para conservar la paridad con la versión web: mismo algoritmo, misma
## secuencia, mismos mapas. Eso permite comparar ambas versiones casilla a
## casilla mientras dure la migración.

var seed_value: int = 0
var _state: int = 0


func _init(s = 0) -> void:
	seed_value = hash_seed(s) if s is String else (int(s) & 0xFFFFFFFF)
	_state = seed_value


## Convierte un texto en un entero de 32 bits usable como semilla.
static func hash_seed(text: String) -> int:
	var h := 1779033703 ^ text.length()
	for i in text.length():
		h = _imul(h ^ text.unicode_at(i), 3432918353)
		h = ((h << 13) | (h >> 19)) & 0xFFFFFFFF
	return h & 0xFFFFFFFF


## Multiplicación de 32 bits con truncamiento, equivalente a Math.imul.
static func _imul(a: int, b: int) -> int:
	var al := a & 0xFFFF
	var ah := (a >> 16) & 0xFFFF
	var bl := b & 0xFFFF
	var bh := (b >> 16) & 0xFFFF
	return (al * bl + (((ah * bl + al * bh) << 16) & 0xFFFFFFFF)) & 0xFFFFFFFF


## Siguiente valor en [0,1). Equivalente a mulberry32.
func next() -> float:
	_state = (_state + 0x6D2B79F5) & 0xFFFFFFFF
	var t := _state
	t = _imul(t ^ (t >> 15), t | 1)
	t ^= (t + _imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF
	return float(((t ^ (t >> 14)) & 0xFFFFFFFF)) / 4294967296.0


func randf_range_(a: float, b: float) -> float:
	return a + next() * (b - a)


## Rango inclusivo en ambos extremos.
func randi_range_(a: int, b: int) -> int:
	return a + int(next() * float(b - a + 1))


func chance(p: float = 0.5) -> bool:
	return next() < p


func pick(arr: Array):
	return arr[int(next() * arr.size())]


## Elige un índice según pesos relativos (no hace falta que sumen 1).
func weighted(weights: Array) -> int:
	var total := 0.0
	for w in weights:
		total += w
	var r := next() * total
	for i in weights.size():
		r -= weights[i]
		if r <= 0.0:
			return i
	return weights.size() - 1


## Deriva un generador hijo: sub-sistemas independientes sin acoplar secuencias.
func fork(tag: String = "") -> Rng:
	return Rng.new((hash_seed(tag) ^ int(next() * 4294967295.0)) & 0xFFFFFFFF)


# --- Ruido de valor con octavas ---
# Suficiente para relieve y biomas, y sin dependencias externas.

static func hash2(x: int, y: int, s: int) -> float:
	var h := s ^ _imul(x, 374761393) ^ _imul(y, 668265263)
	h = _imul(h ^ (h >> 13), 1274126177)
	return float(((h ^ (h >> 16)) & 0xFFFFFFFF)) / 4294967296.0


static func _smooth(t: float) -> float:
	return t * t * (3.0 - 2.0 * t)


## En coordenadas enteras no interpola: devuelve el hash puro, uniforme en [0,1].
static func noise2d(x: float, y: float, s: int = 0) -> float:
	var xi := int(floor(x))
	var yi := int(floor(y))
	var xf := x - float(xi)
	var yf := y - float(yi)
	var u := _smooth(xf)
	var v := _smooth(yf)
	var a := hash2(xi, yi, s)
	var b := hash2(xi + 1, yi, s)
	var c := hash2(xi, yi + 1, s)
	var d := hash2(xi + 1, yi + 1, s)
	return (a * (1.0 - u) + b * u) * (1.0 - v) + (c * (1.0 - u) + d * u) * v


## Ruido fractal: varias octavas de ruido de valor. Devuelve [0,1].
static func fbm(x: float, y: float, s: int = 0, octaves: int = 4,
		lacunarity: float = 2.0, gain: float = 0.5) -> float:
	var amp := 1.0
	var freq := 1.0
	var total := 0.0
	var norm := 0.0
	for i in octaves:
		total += amp * noise2d(x * freq, y * freq, s + i * 1013)
		norm += amp
		amp *= gain
		freq *= lacunarity
	return total / norm
