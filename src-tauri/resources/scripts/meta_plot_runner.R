args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) {
  stop("Usage: meta_plot_runner.R <request.json> <response.json>")
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
source(file.path(script_root, "rna", "meta_plot_runtime_cache.R"))
source(file.path(script_root, "rna", "desktop_meta_plot_data.R"))
source(file.path(script_root, "rna", "meta_plot.annotation.R"))
source(file.path(script_root, "rna", "meta_plot.mapping.R"))
source(file.path(script_root, "rna", "meta_plot.plot.R"))
source(file.path(script_root, "rna", "meta_plot.chart.R"))
source(file.path(script_root, "rna", "meta_plot.analysis.R"))

meta_plot_progress_update <- function(progress, value, detail) {
  message(sprintf("[meta-plot][%s%%] %s", value, detail))
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

    result <- run_meta_plot_analysis(
      upload_context = upload_context,
      controls = payload$controls,
      annotation_dir = payload$annotationDir,
      progress = NULL
    )

    write_result(list(
      status = "ok",
      summary = list(
        species = result$species,
        sampleCount = result$sample_count,
        intervalCount = result$interval_count,
        sampledPointCount = result$sampled_point_count,
        overlapCount = result$overlap_count
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
