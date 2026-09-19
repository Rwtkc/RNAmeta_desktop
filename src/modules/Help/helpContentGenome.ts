import type { HelpPage } from "./helpTypes";

export const helpContentGenome: HelpPage[] = [
  {
    id: "help-genome-browser",
    title: "Genome Browser",
    summary:
      "Map BED intervals to transcript coordinates, select an overlap row, and inspect the complete transcript and mapped region in the embedded IGV browser.",
    sections: [
      {
        title: "Before running Genome Browser",
        paragraphs: [
          "Genome Browser currently supports Arabidopsis thaliana with the TAIR10 reference bundle. Complete Project Configuration validation and upload at least one BED file before starting the mapping workflow.",
          "The selected annotation directory must contain the TAIR10 genomic FASTA, its FAI index, and the expected compressed GFF3 file. The module reports a readiness warning when the reference context or BED input is incomplete."
        ],
        lists: [
          {
            label: "Required TAIR10 files",
            items: [
              "Arabidopsis_thaliana.TAIR10.dna.toplevel.fa",
              "Arabidopsis_thaliana.TAIR10.dna.toplevel.fa.fai",
              "Arabidopsis_thaliana.TAIR10.51.gff3.gz"
            ]
          }
        ]
      },
      {
        title: "Map a BED file to transcripts",
        paragraphs: [
          "Use BED input to choose the file you want to analyze, then select Run Genome Browser. The mapping table reports genomic coordinates, transcript-relative intervals, transcript identifiers, gene identifiers, and transcript lengths for the detected overlaps.",
          "Use the full-width search box to filter transcript or BED fields. Pagination changes only the visible table page and does not modify the mapping result."
        ],
        lists: [
          {
            label: "BED switching behavior",
            items: [
              "Each BED file keeps its own mapping table, selected row, and IGV result during the current application session.",
              "Switching to another BED restores that BED's cached result when one is available.",
              "Changing the annotation directory or species clears the cache to prevent reference mismatch."
            ]
          }
        ]
      },
      {
        title: "Open a transcript in IGV",
        paragraphs: [
          "Select Open in IGV for a mapping row to build the complete transcript workspace. The embedded browser shows the transcript coordinate system, sequence context, BED overlap, and transcript-region annotation without opening an external console window.",
          "The selected transcript workspace is cached in memory, so reopening the same transcript interval during the session avoids rebuilding it when the cached files remain available."
        ],
        lists: [
          {
            label: "Viewer controls",
            items: [
              "Select Tracks controls track visibility.",
              "Crosshairs shows the current coordinate in bp.",
              "Center Line and Track Labels control the corresponding IGV overlays.",
              "Save Image exports the current browser view as PNG or PDF; PNG supports 1× to 4× resolution."
            ]
          }
        ]
      },
      {
        title: "Keep and reset results",
        paragraphs: [
          "Leaving Genome Browser for another sidebar page no longer discards its state. Returning to the page restores the BED selection, mapping table, selected transcript, search state, and rendered IGV view.",
          "Select a different BED when you want a separate result. Use Run Genome Browser again when the selected BED has not yet been mapped or when you intentionally want to rebuild its current result."
        ]
      }
    ]
  },
  {
    id: "help-structure",
    title: "Structure",
    summary:
      "Map BED overlaps to transcripts, fold complete transcript sequences with the bundled offline RNAfold runtime, and inspect the highlighted secondary structure.",
    sections: [
      {
        title: "Before running Structure",
        paragraphs: [
          "Structure currently uses the same TAIR10 reference requirements as Genome Browser. Complete Project Configuration validation, upload a BED file, and select the intended BED input before running transcript mapping.",
          "RNAfold is bundled with RNAmeta Desktop and runs locally. The folding step does not require an internet connection or a separately installed ViennaRNA environment."
        ]
      },
      {
        title: "Map and fold a transcript",
        paragraphs: [
          "Select Run Structure to create the transcript mapping table. Find the required overlap row with search or pagination, then select Run RNAfold in the Structure column.",
          "A confirmation dialog shows the transcript identifier, transcript interval, and transcript length. RNAfold starts only after confirmation and folds the complete transcript sequence rather than only the BED interval."
        ],
        lists: [
          {
            label: "Rendered result",
            items: [
              "Transcript identifier and full transcript length",
              "Mapped BED interval in transcript coordinates",
              "RNAfold minimum free energy when available",
              "Sequence and dot-bracket data in the expandable details section"
            ]
          }
        ]
      },
      {
        title: "Read and navigate the structure",
        paragraphs: [
          "The structure viewer renders the complete transcript and marks only the BED-overlap nucleotides in red. Other nucleotides use a neutral style so the mapped interval remains visually distinct.",
          "Use zoom and canvas dragging to inspect dense regions. Long transcripts contain many SVG elements, so the viewer reduces coordinate-label density and disables continuous force animation to keep navigation responsive."
        ]
      },
      {
        title: "Export the structure",
        paragraphs: [
          "Use Export after a structure has rendered. PNG export offers 2×, 3×, and 4× resolution, with 3× selected by default. Higher multipliers improve zoomed-in text and line detail but increase memory use, export time, and file size.",
          "PDF export is vector-based and does not require a resolution multiplier. Export uses the full RNA structure boundary rather than the current pan and zoom position, and preserves the neutral nucleotide style and red BED highlight."
        ]
      },
      {
        title: "BED and page switching behavior",
        paragraphs: [
          "Structure keeps a separate mapping table, selected row, folded result, and runtime cache for each BED file during the current application session. Switching back to a previously analyzed BED restores its result without rerunning RNAfold.",
          "Leaving Structure for another sidebar page only hides the module; it does not discard the current result. Closing RNAmeta Desktop ends the in-memory cache, and changing the species or annotation directory clears it for biological consistency."
        ]
      }
    ]
  }
];
