args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) {
  stop("Usage: translation_runner.R <request.json> <response.json>")
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
source(file.path(script_root, "rna", "peak_distribution_runtime_cache.R"))
source(file.path(script_root, "rna", "desktop_peak_distribution_data.R"))
source(file.path(script_root, "rna", "peak_distribution.shared.R"))
source(file.path(script_root, "rna", "peak_distribution.annotation.R"))
source(file.path(script_root, "rna", "site_profile_runtime_cache.R"))
source(file.path(script_root, "rna", "site_profile_core.R"))
source(file.path(script_root, "rna", "site_profile_heatmap.R"))
source(file.path(script_root, "rna", "site_profile_chart_helpers.R"))
source(file.path(script_root, "rna", "translation.functions.R"))
source(file.path(script_root, "rna", "translation.chart.R"))
source(file.path(script_root, "rna", "translation.analysis.R"))

translation_progress_update <- function(progress, value, detail) {
  message(sprintf("[translation][%s%%] %s", value, detail))
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

    result <- run_translation_analysis(
      upload_context = upload_context,
      controls = if (!is.null(payload$controls)) payload$controls else list(),
      annotation_dir = payload$annotationDir,
      progress = NULL
    )

    write_result(list(
      status = "ok",
      summary = list(
        species = result$species,
        sampleCount = result$sample_count,
        intervalCount = result$interval_count,
        heatmapSample = if (is.na(result$heatmap_sample)) NULL else result$heatmap_sample,
        boundaryHitCount = result$boundary_hit_count
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
