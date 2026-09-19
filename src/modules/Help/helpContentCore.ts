import type { HelpPage } from "./helpTypes";

export const helpContentCore: HelpPage[] = [
  {
    id: "help-overview",
    title: "Overview",
    summary:
      "Understand what RNAmeta Desktop is designed to do, how it relates to the web platform, and which analysis modules are currently available in the local client.",
    sections: [
      {
        title: "What RNAmeta Desktop is",
        paragraphs: [
          "RNAmeta Desktop is a local analysis workspace for BED-formatted RNA modification peak coordinates. It is designed to take interval files produced by common peak callers, connect them to a species-aware transcript annotation bundle, and organize the downstream interpretation into focused analysis modules.",
          "The desktop client emphasizes local execution. Species selection, annotation validation, upload preview, chart rendering, export, and process control are handled inside the application, while the underlying R workflows are launched from the local desktop runtime."
        ],
        lists: [
          {
            label: "Current desktop analysis coverage",
            items: [
              "Project Configuration for species and annotation directory setup",
              "Upload / Run for BED ingestion and session context preparation",
              "Genome Browser for transcript-coordinate mapping and embedded IGV inspection",
              "Structure for offline RNAfold secondary-structure analysis",
              "Meta Plot for transcript-relative distribution profiles",
              "Peak Distribution for feature-level annotation proportions",
              "Gene Statistics for Gene Type, Peak Gene Size, and Gene Matrix",
              "Exon Statistics for Peak Exon Size, Peak Exon Type, and Peak Exon Num",
              "Site for Transcription, Translation, and Splicesite boundary profiles"
            ]
          }
        ]
      },
      {
        title: "Relationship to the web platform",
        paragraphs: [
          "The desktop client follows the same overall RNAmeta analysis logic and naming system as the public web platform, so users can move between the two with minimal conceptual friction. The web entry point is https://rnainformatics.cn/RNAmeta-online/ and serves as the official online reference for the broader project presentation.",
          "When both platforms describe the same module, use the desktop behavior shown inside the client as the practical source of truth for local work. The web platform is best treated as complementary documentation, external presentation material, and a reference for module intent."
        ],
        lists: [
          {
            label: "Important scope difference",
            items: [
              "The current desktop client focuses on local analysis modules.",
              "The web platform includes a Motif job workflow, but that workflow is not part of the current desktop navigation.",
              "If a screen or workflow exists on the website but not in the desktop sidebar, assume it is not yet implemented in the local client."
            ]
          }
        ]
      },
      {
        title: "How the desktop workflow is organized",
        paragraphs: [
          "The expected working order is: configure species and annotation library, upload one or more BED files, run a module, inspect the rendered result, and export either figures or normalized table data.",
          "Each analysis module reads from the currently saved upload context. If you replace the uploaded BED set, old results are cleared so that visualizations do not remain attached to the wrong inputs. Likewise, changing the species or annotation directory invalidates existing analysis results because the biological reference context has changed."
        ]
      }
    ]
  },
  {
    id: "help-getting-started",
    title: "Getting Started",
    summary:
      "Set up a valid project context before analysis: select the reference species, validate the annotation library, upload BED files, and then move into the analysis modules.",
    sections: [
      {
        title: "Step 1: Select the reference species",
        paragraphs: [
          "Open Project Configuration and use the species selector to choose the genome or species entry that matches the annotation bundle you intend to use. The selected species is not cosmetic; it controls how the client validates annotation files and determines whether downstream analyses are biologically aligned.",
          "If you change the species later, the client clears old module results. This is intentional and prevents charts from remaining visible after the reference context has changed."
        ]
      },
      {
        title: "Step 2: Validate the annotation directory",
        paragraphs: [
          "Choose the external annotation directory that contains the files required for the selected species. The client checks that the expected GFF-, TxDb-, and transcript-length-related resources exist for the chosen species entry.",
          "A valid annotation bundle is the gate that unlocks reliable downstream analysis. If the validation panel shows missing items, resolve those missing files before trusting any biological interpretation."
        ],
        lists: [
          {
            label: "Practical validation guidance",
            items: [
              "Use a species-specific annotation folder that has already been prepared for RNAmeta.",
              "After changing files on disk, return to the app or refocus the window to let the validation status refresh.",
              "Treat the status line as the minimum readiness check before moving on to Upload / Run."
            ]
          }
        ]
      },
      {
        title: "Step 3: Build the upload session",
        paragraphs: [
          "Move to Upload / Run and select one or more BED files that belong to the same biological interpretation context. The desktop app normalizes and previews the uploaded files, then stores that prepared session so the analysis modules can reuse it without asking for input again on every page.",
          "When you upload a new BED set, previous analysis outputs are reset. This avoids accidental carry-over from an earlier sample group."
        ]
      },
      {
        title: "Step 4: Run modules and export results",
        paragraphs: [
          "After the upload context is ready, open an analysis module in the sidebar and run it with the current settings. Genome Browser and Structure first map the selected BED file to transcript coordinates, while the statistical modules run directly from the shared upload context.",
          "Figure export supports image-oriented outputs, while supported statistical modules also provide normalized tables in CSV or TXT form for downstream work. Structure uses PNG resolution multipliers and vector PDF export, and Genome Browser provides its own Save Image dialog inside the IGV workspace."
        ]
      }
    ]
  },
  {
    id: "help-upload-run",
    title: "Upload / Run",
    summary:
      "Prepare the shared BED context used by the downstream modules, verify file identity, and understand what happens when files are replaced or re-uploaded.",
    sections: [
      {
        title: "Purpose of Upload / Run",
        paragraphs: [
          "Upload / Run is the shared staging area for local BED analysis. Instead of asking every module to browse for files independently, RNAmeta Desktop builds one consistent upload session and lets the analysis pages reuse it.",
          "This design keeps the analysis workflow stable: one upload context, multiple interpretation modules, and one place to verify that the selected files are the correct ones before computation begins."
        ]
      },
      {
        title: "Working with BED files",
        paragraphs: [
          "Load BED files that represent the peak intervals you want to analyze. In multi-file workflows, each file remains traceable through the charts and tooltips, so keeping clear sample names is useful for interpretation and export.",
          "The desktop client performs a normalization pass on uploaded BED content before the downstream modules read it. That normalized representation is an implementation detail of the local runtime, not a new user-facing biological dataset."
        ],
        lists: [
          {
            label: "Recommended input habits",
            items: [
              "Upload files from the same species and annotation context in a single session.",
              "Use distinct and readable file names, because many charts expose the file label in legends, tooltips, or exported tables.",
              "If you switch to a different sample batch, re-upload the new files instead of trying to interpret old results."
            ]
          }
        ]
      },
      {
        title: "What happens when files change",
        paragraphs: [
          "Re-uploading a new BED set clears the old analysis results across modules. This is intentional and prevents the interface from showing charts that belong to a previous upload context.",
          "If you repeatedly upload the same original BED files, the desktop client can reuse cached computation during the current application session. The cache is keyed to the original input identity rather than transient normalized file names, so identical re-uploads are more stable than before."
        ]
      },
      {
        title: "How Upload / Run supports the rest of the app",
        paragraphs: [
          "Genome Browser, Structure, Meta Plot, Peak Distribution, Gene Statistics, Exon Statistics, and Site all read from the upload session prepared here. Genome Browser and Structure additionally let you select which uploaded BED file to map. If Upload / Run is incomplete or inconsistent, the later modules will either fail or produce outputs that are difficult to trust.",
          "In practice, Upload / Run is the place to slow down and confirm that the desktop session truly matches the biological question you want to answer."
        ]
      }
    ]
  }
];
