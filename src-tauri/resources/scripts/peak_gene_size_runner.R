args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) {
  stop("Usage: peak_gene_size_runner.R <request.json> <response.json>")
}

request_path <- normalizePath(args[[1]], winslash = "/", mustWork = TRUE)
response_path <- args[[2]]
script_flag <- grep("^--file=", commandArgs(FALSE), value = TRUE)
script_path <- normalizePath(sub("^--file=", "", script_flag[[1]]), winslash = "/")
script_root <- dirname(script_path)

suppressPackageStartupMessages({
  library(jsonlite)
})

source(file.path(script_root, "rna", "upload_run.functions.R"))
source(file.path(script_root, "rna", "sample_display_metadata.R"))
source(file.path(script_root, "rna", "peak_gene_size.functions.R"))
source(file.path(script_root, "rna", "peak_gene_size.data.R"))
source(file.path(script_root, "rna", "peak_gene_size.chart.R"))
source(file.path(script_root, "rna", "peak_gene_size.analysis.R"))

peak_gene_size_progress_update <- function(progress, value, detail) {
  message(sprintf("[peak-gene-size][%s%%] %s", value, detail))
}

write_result <- function(payload) {
  writeLines(
    jsonlite::toJSON(payload, auto_unbox = TRUE, null = "null", pretty = TRUE, digits = 16),
    response_path,
    useBytes = TRUE
  )
}

tryCatch(
  {
    payload <- jsonlite::fromJSON(request_path, simplifyVector = FALSE)
    upload_context <- list(
      species = payload$species,
      species_id = if (!is.null(payload$speciesId)) payload$speciesId else payload$species,
      saved_files = lapply(payload$filePaths, function(file_path) {
        list(
          file_name = basename(file_path),
          file_path = file_path
        )
      })
    )

    result <- run_peak_gene_size_analysis(
      upload_context = upload_context,
      controls = list(),
      annotation_dir = payload$annotationDir,
      progress = NULL
    )

    write_result(list(
      status = "ok",
      summary = list(
        species = result$species,
        sampleCount = result$sample_count,
        intervalCount = result$interval_count,
        transcriptCount = result$transcript_count
      ),
      chartPayload = result$chart_payload
    ))
  },
  error = function(err) {
    message(conditionMessage(err))
    write_result(list(
      status = "error",
      message = conditionMessage(err)
    ))
    quit(status = 1)
  }
)

quit(save = "no", status = 0L, runLast = FALSE)
