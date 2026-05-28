export type AdaptiveProgressPhase = {
    id: string;
    message: string;
    minPercent: number;
    maxPercent: number;
};

// Contiguous ranges from 0..100. Final bucket includes 100.
export const ADAPTIVE_PROGRESS_PHASES: AdaptiveProgressPhase[] = [
    { id: 'p01', message: 'Getting the general outline', minPercent: 0, maxPercent: 4 },
    { id: 'p02', message: 'Sketching your broad profile', minPercent: 4, maxPercent: 8 },
    { id: 'p03', message: 'Finding major patterns', minPercent: 8, maxPercent: 12 },
    { id: 'p04', message: 'Building an early signal map', minPercent: 12, maxPercent: 16 },
    { id: 'p05', message: 'Establishing your baseline', minPercent: 16, maxPercent: 20 },
    { id: 'p06', message: 'Adding more context', minPercent: 20, maxPercent: 24 },
    { id: 'p07', message: 'Spotting key tendencies', minPercent: 24, maxPercent: 28 },
    { id: 'p08', message: 'Comparing competing signals', minPercent: 28, maxPercent: 32 },
    { id: 'p09', message: 'Narrowing things down', minPercent: 32, maxPercent: 36 },
    { id: 'p10', message: 'Testing stronger hypotheses', minPercent: 36, maxPercent: 40 },
    { id: 'p11', message: 'Reducing ambiguity', minPercent: 40, maxPercent: 44 },
    { id: 'p12', message: 'Sharpening the centerline', minPercent: 44, maxPercent: 48 },
    { id: 'p13', message: 'Balancing trait coverage', minPercent: 48, maxPercent: 52 },
    { id: 'p14', message: 'Following up on contradictions', minPercent: 52, maxPercent: 56 },
    { id: 'p15', message: 'Refining the signal mix', minPercent: 56, maxPercent: 60 },
    { id: 'p16', message: 'Locking in stronger evidence', minPercent: 60, maxPercent: 64 },
    { id: 'p17', message: 'Clarifying close calls', minPercent: 64, maxPercent: 68 },
    { id: 'p18', message: 'Improving confidence', minPercent: 68, maxPercent: 72 },
    { id: 'p19', message: 'Focusing on remaining gaps', minPercent: 72, maxPercent: 76 },
    { id: 'p20', message: 'Converging on your profile', minPercent: 76, maxPercent: 80 },
    { id: 'p21', message: 'Fine-tuning results', minPercent: 80, maxPercent: 84 },
    { id: 'p22', message: 'Confirming subtle differences', minPercent: 84, maxPercent: 88 },
    { id: 'p23', message: 'Polishing final fit', minPercent: 88, maxPercent: 92 },
    { id: 'p24', message: 'Preparing final summary', minPercent: 92, maxPercent: 96 },
    { id: 'p25', message: 'Finalizing your outcome', minPercent: 96, maxPercent: 100 },
];
