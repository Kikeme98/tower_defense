class_name Balance
extends RefCounted

## Todos los números que definen la curva de dificultad viven aquí.
## Tocar el juego = tocar este archivo, no perseguir constantes por el código.

const START_GOLD := 320
const START_LIVES := 20

## Escalado enemigo por oleada. El exponencial es lo que obliga a mejorar torres
## en vez de limitarse a construir más; el oro crece mucho más despacio.
const HP_EXP := 1.115
## El exponente crece con la oleada: si fuese constante, a partir de cierto punto
## acumular torres gana siempre y la partida se vuelve un trámite.
const HP_EXP_GROWTH := 0.0005
const HP_LINEAR := 0.04
const SPEED_PER_WAVE := 0.005
const GOLD_PER_WAVE := 0.028

const BASE_COUNT := 7
const COUNT_PER_WAVE := 1.35
const COUNT_MAX := 90
const SPAWN_INTERVAL := 0.62
const SPAWN_INTERVAL_MIN := 0.16

const BOSS_EVERY := 10
const BOSS_HP_MULT := 32.0
const BOSS_GOLD_MULT := 14.0

## Un sector = un tramo de oleadas. Al cambiar de sector el mapa crece.
const WAVES_PER_SECTOR := 5
const SECTOR_DIFFICULTY := 1.08

## Oro entre oleadas: interés sobre lo ahorrado, con tope. Premia no gastarlo
## todo de golpe sin convertirse en la única estrategia.
const WAVE_BONUS_BASE := 25
const WAVE_BONUS_PER_WAVE := 7
const INTEREST := 0.05
const INTEREST_CAP := 60

const SELL_RATIO := 0.6
const CARD_CHOICES := 3

## Ralentización: se acumula hasta un tope y decae con el tiempo.
const SLOW_CAP := 0.60
const SLOW_DECAY := 0.10
## Fracción del depósito de veneno que se aplica por segundo.
const DOT_DRAIN := 0.45


static func hp_scale(wave: int, sector: int) -> float:
	var e := HP_EXP + float(wave) * HP_EXP_GROWTH
	return pow(e, float(wave - 1)) \
		* (1.0 + float(wave) * HP_LINEAR) \
		* pow(SECTOR_DIFFICULTY, float(sector - 1))


static func gold_scale(wave: int) -> float:
	return 1.0 + float(wave - 1) * GOLD_PER_WAVE


static func enemy_count(wave: int) -> int:
	return mini(COUNT_MAX, int(round(BASE_COUNT + float(wave - 1) * COUNT_PER_WAVE)))


static func is_boss_wave(wave: int) -> bool:
	return wave % BOSS_EVERY == 0


static func sector_of(wave: int) -> int:
	return (wave - 1) / WAVES_PER_SECTOR + 1
