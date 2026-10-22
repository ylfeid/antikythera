// Literature the model is built from. Gear entries, trains and parameters cite
// these keys; the README reference list is generated from the same table.

export interface Source {
  key: string;
  short: string;
  citation: string;
  doi?: string;
  url?: string;
  openAccess?: boolean;
}

export const SOURCES = {
  freeth2006: {
    key: 'freeth2006',
    short: 'Freeth et al. 2006',
    citation:
      'Freeth, T., Bitsakis, Y., Moussas, X., Seiradakis, J. H., Tselikas, A., Mangou, H., Zafeiropoulou, M., Hadland, R., Bate, D., Ramsey, A., Allen, M., Crawley, A., Hockley, P., Malzbender, T., Gelb, D., Ambrisco, W. & Edmunds, M. G. Decoding the ancient Greek astronomical calculator known as the Antikythera Mechanism. Nature 444, 587–591 (2006).',
    doi: '10.1038/nature05357',
  },
  freeth2008: {
    key: 'freeth2008',
    short: 'Freeth et al. 2008',
    citation:
      'Freeth, T., Jones, A., Steele, J. M. & Bitsakis, Y. Calendars with Olympiad display and eclipse prediction on the Antikythera Mechanism. Nature 454, 614–617 (2008).',
    doi: '10.1038/nature07130',
  },
  freethJones2012: {
    key: 'freethJones2012',
    short: 'Freeth & Jones 2012',
    citation: 'Freeth, T. & Jones, A. The Cosmos in the Antikythera Mechanism. ISAW Papers 4 (2012).',
    url: 'http://dlib.nyu.edu/awdl/isaw/isaw-papers/4/',
    openAccess: true,
  },
  freeth2014: {
    key: 'freeth2014',
    short: 'Freeth 2014',
    citation:
      'Freeth, T. Eclipse prediction on the ancient Greek astronomical calculating machine known as the Antikythera Mechanism. PLoS ONE 9(7), e103275 (2014).',
    doi: '10.1371/journal.pone.0103275',
    openAccess: true,
  },
  freeth2021: {
    key: 'freeth2021',
    short: 'Freeth et al. 2021',
    citation:
      'Freeth, T., Higgon, D., Dacanalis, A., MacDonald, L., Georgakopoulou, M. & Wojcik, A. A Model of the Cosmos in the ancient Greek Antikythera Mechanism. Scientific Reports 11, 5821 (2021); author correction 11, 17361 (2021).',
    doi: '10.1038/s41598-021-84310-w',
    openAccess: true,
  },
  edmunds2011: {
    key: 'edmunds2011',
    short: 'Edmunds 2011',
    citation:
      'Edmunds, M. G. An Initial Assessment of the Accuracy of the Gear Trains in the Antikythera Mechanism. Journal for the History of Astronomy 42(3), 307–320 (2011).',
    doi: '10.1177/002182861104200302',
  },
  szigety2025: {
    key: 'szigety2025',
    short: 'Szigety & Arenas 2025',
    citation:
      'Szigety, E. G. & Arenas, G. F. The Impact of Triangular-Toothed Gears on the Functionality of the Antikythera Mechanism. arXiv:2504.00327 (2025).',
    url: 'https://arxiv.org/abs/2504.00327',
    openAccess: true,
  },
  carman2012: {
    key: 'carman2012',
    short: 'Carman, Thorndike & Evans 2012',
    citation:
      'Carman, C. C., Thorndike, A. & Evans, J. On the Pin-and-Slot Device of the Antikythera Mechanism, with a New Application to the Superior Planets. Journal for the History of Astronomy 43(1), 93–116 (2012).',
    doi: '10.1177/002182861204300106',
  },
  price1974: {
    key: 'price1974',
    short: 'Price 1974',
    citation:
      'Price, D. de S. Gears from the Greeks: the Antikythera Mechanism, a calendar computer from ca. 80 B.C. Transactions of the American Philosophical Society 64(7), 1–70 (1974).',
    doi: '10.2307/1006146',
  },
  woan2024: {
    key: 'woan2024',
    short: 'Woan & Bayley 2024',
    citation:
      'Woan, G. & Bayley, J. An improved calendar ring hole-count for the Antikythera mechanism. The Horological Journal (July 2024); arXiv:2403.00040.',
    url: 'https://arxiv.org/abs/2403.00040',
    openAccess: true,
  },
  toomer1984: {
    key: 'toomer1984',
    short: 'Ptolemy, Almagest (Toomer)',
    citation: "Toomer, G. J. Ptolemy's Almagest (Duckworth, London, 1984), III.4 (Hipparchus' solar eccentricity 1/24, apogee at Gemini 5½°).",
  },
  cross2021: {
    key: 'cross2021',
    short: 'Astronomy Engine',
    citation:
      'Cross, D. Astronomy Engine v2 (MIT licence): VSOP87 planets, Chapront ELP-derived Moon, Espenak & Meeus ΔT.',
    url: 'https://github.com/cosinekitty/astronomy',
    openAccess: true,
  },
} as const satisfies Record<string, Source>;

export type SourceKey = keyof typeof SOURCES;
