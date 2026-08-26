import {
  COUNTER_OFFER_CHANCE,
  COUNTER_OFFER_FLOOR_RATIO,
  COUNTER_OFFER_POSITION,
  KARIZMA_COUNTER_POSITION_EFFECT_PER_POINT,
  KARIZMA_NEUTRAL_SCORE,
  KARIZMA_THRESHOLD_EFFECT_PER_POINT,
  NEGOTIATION_INITIAL_PATIENCE,
  NEGOTIATION_INSULTING_GAP_RATIO,
  NEGOTIATION_LOW_GAP_RATIO,
  NEGOTIATION_MINOR_GAP_RATIO,
  NEGOTIATION_REPEAT_OFFER_BAND_RATIO,
} from '../config/economyConfig';
import type { BargainingStyle } from '../types/negotiation';

/**
 * v3 mimari birleşimi: pazarlık motoru artık `src/engine/`de yaşıyor —
 * UI'dan (NegotiationPanel) ve store'dan (useGameStore) tamamen bağımsız,
 * saf fonksiyonlar. Önceki adı `src/utils/negotiationEngine.ts` idi.
 *
 * KRİTİK — "AYNI TEKLİFİ TEKRAR GÖNDER" İSTİSMARI KAPALI: Oyun B'nin
 * (kuyumcu-simulatoru-mobile) `evaluateOffer`'ı kabulü HER ÇAĞRIDA bağımsız
 * bir `rng() < acceptanceProbability` zarıyla belirliyordu — bu, oyuncunun
 * DÜŞÜK bir teklifi (örn. %85) art arda göndererek düşük ihtimali bile
 * zamanla RNG lehine çevirebilmesi anlamına geliyordu (spam-kabul istismarı).
 * Buradaki motor KASITLI OLARAK deterministiktir: `offerTl >= adjustedThreshold`
 * ise kabul KESİNDİR (rastgelelik yok); eşiğin altındaysa sonuç ya karşı
 * teklif ya da RET'tir — ret TERMİNALDİR (müşteri o pazarlıktan tamamen
 * ayrılır, aynı teklifi tekrar göndermek için ikinci bir şans YOKTUR).
 * Yani ne kadar çok denenirse denensin, yetersiz bir teklif asla "şansla"
 * kabul olamaz — kabul her zaman offer/threshold karşılaştırmasının
 * doğrudan sonucudur.
 */

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export type BargainOutcome =
  | { kind: 'accept' }
  | { kind: 'counter'; counterAmountTl: number }
  | { kind: 'reject' };

interface EvaluateArgs {
  bargainingStyle: BargainingStyle;
  karizmaScore: number;
  roundsUsed: number;
  maxRounds: number;
}

function counterPosition(bargainingStyle: BargainingStyle, karizmaScore: number): number {
  return clamp(
    COUNTER_OFFER_POSITION[bargainingStyle] -
      (karizmaScore - KARIZMA_NEUTRAL_SCORE) * KARIZMA_COUNTER_POSITION_EFFECT_PER_POINT,
    0.1,
    0.98,
  );
}

/**
 * Alım-bozdurma yönünde (dükkân müşteriden alıyor) bir teklifi değerlendirir.
 * `thresholdTl` müşterinin kabul edeceği ASGARİ (taban) tutar. Karizma
 * (0-100, 50 nötr) yüksekse taban hafifçe düşer; pazarlık tarzı (sert/
 * dengeli/kolay) karşı teklif verme ihtimalini ve karşı teklifin oyuncu
 * lehine ne kadar kayacağını belirler.
 */
export function evaluateBuyOffer(
  args: EvaluateArgs & { offerTl: number; thresholdTl: number },
): BargainOutcome {
  const { offerTl, thresholdTl, bargainingStyle, karizmaScore, roundsUsed, maxRounds } = args;
  const karizmaFactor = clamp(1 - (karizmaScore - KARIZMA_NEUTRAL_SCORE) * KARIZMA_THRESHOLD_EFFECT_PER_POINT, 0.85, 1.15);
  const adjustedThreshold = thresholdTl * karizmaFactor;

  if (offerTl >= adjustedThreshold) return { kind: 'accept' };

  const shortfallRatio = (adjustedThreshold - offerTl) / adjustedThreshold;
  if (shortfallRatio > 1 - COUNTER_OFFER_FLOOR_RATIO || roundsUsed >= maxRounds) {
    return { kind: 'reject' };
  }
  if (Math.random() >= COUNTER_OFFER_CHANCE[bargainingStyle]) {
    return { kind: 'reject' };
  }

  const position = counterPosition(bargainingStyle, karizmaScore);
  const counterAmountTl = Math.round(offerTl + (adjustedThreshold - offerTl) * position);
  return { kind: 'counter', counterAmountTl };
}

/**
 * Satış yönünde (dükkân müşteriye satıyor): `thresholdTl` müşterinin
 * ödemeye razı olduğu AZAMİ (tavan) tutar. Karizma yüksekse tavan hafifçe
 * yükselir.
 */
export function evaluateSellOffer(
  args: EvaluateArgs & { askTl: number; thresholdTl: number },
): BargainOutcome {
  const { askTl, thresholdTl, bargainingStyle, karizmaScore, roundsUsed, maxRounds } = args;
  const karizmaFactor = clamp(1 + (karizmaScore - KARIZMA_NEUTRAL_SCORE) * KARIZMA_THRESHOLD_EFFECT_PER_POINT, 0.85, 1.15);
  const adjustedThreshold = thresholdTl * karizmaFactor;

  if (askTl <= adjustedThreshold) return { kind: 'accept' };

  const overageRatio = (askTl - adjustedThreshold) / adjustedThreshold;
  if (overageRatio > 1 - COUNTER_OFFER_FLOOR_RATIO || roundsUsed >= maxRounds) {
    return { kind: 'reject' };
  }
  if (Math.random() >= COUNTER_OFFER_CHANCE[bargainingStyle]) {
    return { kind: 'reject' };
  }

  const position = counterPosition(bargainingStyle, karizmaScore);
  const counterAmountTl = Math.round(askTl - (askTl - adjustedThreshold) * position);
  return { kind: 'counter', counterAmountTl };
}

/**
 * [YENİ] Toplu Alım — Kalem Bazlı Pazarlık: bir müşteri birden fazla farklı
 * ürünle (ör. Çeyrek + Gram + Bilezik) aynı anda geldiğinde, HER KALEM
 * kendi teklif/eşik/pazarlık-tarzı ile bağımsız değerlendirilir — tek bir
 * sepet fiyatı YOKTUR. Bu fonksiyon tek bir kalemi değerlendirir; çağıran
 * (NegotiationPanel) kalemleri sırayla bu fonksiyona besler (bkz.
 * NegotiationLineItem / IncomingCustomer.lines).
 */
export function evaluateLineItemOffer(
  args: EvaluateArgs & { offerTl: number; thresholdTl: number },
): BargainOutcome {
  return evaluateBuyOffer(args);
}

export type NegotiationDirection = 'buy' | 'sell';
export type NegotiationReactionTone = 'accept' | 'counter' | 'warning' | 'repeat' | 'final' | 'leave';
export type NegotiationPhase = 'OPEN' | 'HARDENING' | 'FINAL_OFFER' | 'ACCEPTED' | 'REJECTED';

export type NegotiationTurnOutcome =
  | { kind: 'accept'; patienceAfter: number; reaction: string; tone: 'accept'; phaseAfter: 'ACCEPTED' }
  | { kind: 'counter'; counterAmountTl: number; patienceAfter: number; reaction: string; tone: 'counter'; phaseAfter: 'HARDENING' }
  | { kind: 'warning'; patienceAfter: number; reaction: string; tone: 'warning' | 'repeat'; phaseAfter: 'OPEN' | 'HARDENING' | 'FINAL_OFFER' }
  | { kind: 'final'; counterAmountTl: number; patienceAfter: number; reaction: string; tone: 'final'; phaseAfter: 'FINAL_OFFER' }
  | { kind: 'leave'; patienceAfter: 0; reaction: string; tone: 'leave'; phaseAfter: 'REJECTED' };

export interface EvaluateNegotiationTurnArgs {
  direction: NegotiationDirection;
  offerTl: number;
  thresholdTl: number;
  bargainingStyle: BargainingStyle;
  urgency?: string;
  karizmaScore: number;
  patience: number;
  previousOffers: number[];
  roundsUsed: number;
  maxRounds: number;
  phase?: NegotiationPhase;
}

function isUrgent(urgency?: string): boolean {
  return urgency?.toLocaleLowerCase('tr-TR').includes('acil') ?? false;
}

function adjustedTurnThreshold(
  direction: NegotiationDirection,
  thresholdTl: number,
  karizmaScore: number,
): number {
  const charismaDelta = (karizmaScore - KARIZMA_NEUTRAL_SCORE) * KARIZMA_THRESHOLD_EFFECT_PER_POINT;
  const factor = direction === 'buy' ? 1 - charismaDelta : 1 + charismaDelta;
  return thresholdTl * clamp(factor, 0.85, 1.15);
}

function unfavorableGapRatio(direction: NegotiationDirection, offerTl: number, thresholdTl: number): number {
  if (direction === 'buy') return Math.max(0, (thresholdTl - offerTl) / thresholdTl);
  return Math.max(0, (offerTl - thresholdTl) / thresholdTl);
}

function isNearRepeat(offerTl: number, previousOffers: number[], thresholdTl: number): boolean {
  const toleranceTl = Math.max(1, thresholdTl * NEGOTIATION_REPEAT_OFFER_BAND_RATIO);
  return previousOffers.some((previousOffer) => Math.abs(previousOffer - offerTl) <= toleranceTl);
}

function counterAmount(
  direction: NegotiationDirection,
  offerTl: number,
  thresholdTl: number,
  bargainingStyle: BargainingStyle,
  karizmaScore: number,
): number {
  const position = counterPosition(bargainingStyle, karizmaScore);
  if (direction === 'buy') {
    const roundedCounter = Math.round(offerTl + (thresholdTl - offerTl) * position);
    return Math.ceil(Math.min(thresholdTl, Math.max(roundedCounter, offerTl + 1)));
  }

  const roundedCounter = Math.round(offerTl - (offerTl - thresholdTl) * position);
  return Math.floor(Math.max(thresholdTl, Math.min(roundedCounter, offerTl - 1)));
}

function pickReaction(options: string[], seed: number): string {
  return options[Math.abs(Math.round(seed)) % options.length] ?? options[0] ?? '';
}

/**
 * Evaluates one active bargaining turn without randomness. The existing
 * threshold and Karizma math is reused; this layer adds visible patience,
 * repeat-offer protection and a finite final-price state for the UI.
 */
export function evaluateNegotiationTurn(args: EvaluateNegotiationTurnArgs): NegotiationTurnOutcome {
  const adjustedThreshold = adjustedTurnThreshold(args.direction, args.thresholdTl, args.karizmaScore);
  const gapRatio = unfavorableGapRatio(args.direction, args.offerTl, adjustedThreshold);
  const phase = args.phase ?? 'OPEN';

  if (gapRatio === 0) {
    return {
      kind: 'accept',
      patienceAfter: args.patience,
      tone: 'accept',
      phaseAfter: 'ACCEPTED',
      reaction:
        args.direction === 'buy'
          ? pickReaction(['Tamamdır, bu rakam olur.', 'Peki, kabul.', 'Bu fiyata anlaştık.'], args.offerTl + args.roundsUsed)
          : pickReaction(['Peki, bu fiyattan alırım.', 'Tamam, alıyorum.', 'Bu fiyat olur.'], args.offerTl + args.roundsUsed),
    };
  }

  if (phase === 'FINAL_OFFER') {
    return {
      kind: 'leave',
      patienceAfter: 0,
      tone: 'leave',
      phaseAfter: 'REJECTED',
      reaction:
        args.direction === 'buy'
          ? 'Son fiyatı söyledim, anlaşamayacağız.'
          : 'Son teklifimi geçemem, iyi günler.',
    };
  }

  if (phase === 'ACCEPTED' || phase === 'REJECTED') {
    return {
      kind: 'leave',
      patienceAfter: 0,
      tone: 'leave',
      phaseAfter: 'REJECTED',
      reaction: 'Bu pazarlık zaten kapanmıştı.',
    };
  }

  const urgent = isUrgent(args.urgency);
  const patienceLoss = gapRatio >= NEGOTIATION_INSULTING_GAP_RATIO ? 2 : gapRatio >= NEGOTIATION_LOW_GAP_RATIO ? 1 : 0;
  const patienceAfter = Math.max(0, args.patience - patienceLoss);

  if (isNearRepeat(args.offerTl, args.previousOffers, adjustedThreshold)) {
    const repeatedPatience = Math.max(0, args.patience - Math.max(1, patienceLoss));
    if (repeatedPatience === 0) {
      return { kind: 'leave', patienceAfter: 0, tone: 'leave', phaseAfter: 'REJECTED', reaction: 'Olmayacak galiba, iyi günler.' };
    }
    return {
      kind: 'warning',
      patienceAfter: repeatedPatience,
      tone: 'repeat',
      phaseAfter: 'HARDENING',
      reaction: pickReaction(
        ['Az önce de aynı rakamı söylediniz.', 'Rakam değişmedi ki.', 'Aynı teklifle ilerleyemeyiz.'],
        args.offerTl + repeatedPatience,
      ),
    };
  }

  if (patienceAfter === 0) {
    return {
      kind: 'leave',
      patienceAfter: 0,
      tone: 'leave',
      phaseAfter: 'REJECTED',
      reaction:
        args.direction === 'buy'
          ? pickReaction(['Bu fiyata verecek değilim. İyi günler.', 'Olmayacak galiba, iyi günler.'], args.offerTl)
          : pickReaction(['Bu fiyata alamam. İyi günler.', 'Olmayacak galiba, iyi günler.'], args.offerTl),
    };
  }

  if (gapRatio >= NEGOTIATION_INSULTING_GAP_RATIO) {
    return {
      kind: 'warning',
      patienceAfter,
      tone: 'warning',
      phaseAfter: 'HARDENING',
      reaction:
        args.direction === 'buy'
          ? pickReaction(['Bu rakama veremem.', 'Biraz daha ciddi bir teklif bekliyorum.'], args.offerTl)
          : pickReaction(['Bu fiyat fazla yüksek.', 'Bu rakamı ödeyemem.'], args.offerTl),
    };
  }

  const finalRound = args.roundsUsed >= args.maxRounds - 1 || (urgent && args.roundsUsed >= 1) || patienceAfter === 1;
  const hardeningRound = args.roundsUsed >= args.maxRounds - 2 || patienceAfter <= 2;
  const proposedCounter = counterAmount(
    args.direction,
    args.offerTl,
    adjustedThreshold,
    args.bargainingStyle,
    args.karizmaScore,
  );

  if (finalRound) {
    return {
      kind: 'final',
      counterAmountTl: proposedCounter,
      patienceAfter,
      tone: 'final',
      phaseAfter: 'FINAL_OFFER',
      reaction: args.direction === 'buy' ? 'Son fiyatım bu.' : 'Son teklifim bu.',
    };
  }

  if (gapRatio >= NEGOTIATION_LOW_GAP_RATIO) {
    return {
      kind: 'warning',
      patienceAfter,
      tone: 'warning',
      phaseAfter: 'HARDENING',
      reaction:
        args.direction === 'buy'
          ? pickReaction(['Bu rakam bana düşük geldi.', 'Bu rakama yaklaşamam.'], args.offerTl + patienceAfter)
          : pickReaction(['Biraz daha makul bir fiyat bekliyorum.', 'Bu fiyat bana yüksek geldi.'], args.offerTl + patienceAfter),
    };
  }

  if (gapRatio <= NEGOTIATION_MINOR_GAP_RATIO || args.bargainingStyle !== 'kolay') {
    return {
      kind: 'counter',
      counterAmountTl: proposedCounter,
      patienceAfter,
      tone: 'counter',
      phaseAfter: 'HARDENING',
      reaction:
        hardeningRound
          ? args.direction === 'buy'
            ? 'Yaklaştık, ama son sınıra geliyoruz.'
            : 'Yaklaştık, ama fazla yukarıda kalıyor.'
          : args.direction === 'buy'
            ? pickReaction(['Biraz daha çıkarsanız anlaşabiliriz.', 'Yaklaştık ama biraz düşük.'], args.offerTl + args.roundsUsed)
            : pickReaction(['Biraz daha inerseniz anlaşabiliriz.', 'Yaklaştık ama biraz yüksek.'], args.offerTl + args.roundsUsed),
    };
  }

  return {
    kind: 'warning',
    patienceAfter,
    tone: 'warning',
    phaseAfter: 'HARDENING',
    reaction:
      args.direction === 'buy'
        ? pickReaction(['Biraz daha ciddi bir teklif bekliyorum.', 'Bu teklif beni ikna etmedi.'], args.offerTl)
        : pickReaction(['Bu fiyat bana yüksek geldi.', 'Biraz daha inmeniz gerekir.'], args.offerTl),
  };
}

export function initialNegotiationPatience(bargainingStyle: BargainingStyle): number {
  return NEGOTIATION_INITIAL_PATIENCE[bargainingStyle];
}
