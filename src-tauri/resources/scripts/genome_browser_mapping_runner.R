args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) stop("Usage: genome_browser_mapping_runner.R request.json response.json")
request_path <- args[[1]]; response_path <- args[[2]]
req <- jsonlite::fromJSON(request_path)
write_result <- function(value) jsonlite::write_json(value, response_path, auto_unbox = TRUE,
  dataframe = "rows", digits = 16, na = "null")
fail <- function(message) {
  write_result(list(status = "error", message = message, rows = list()))
  quit(save = "no", status = 1L, runLast = FALSE)
}
progress <- function(value, detail) message(sprintf("[genome-browser-mapping][%s%%] %s", value, detail))
script <- sub("^--file=", "", grep("^--file=", commandArgs(), value = TRUE)[[1L]])
for (name in c("browser.mapping.R", "browser.annotation.R")) {
  source(file.path(dirname(normalizePath(script)), "rna", name), encoding = "UTF-8")
}
tryCatch({
  progress(5, "Validating staged BED and annotation inputs")
  if (!requireNamespace("data.table", quietly = TRUE)) stop("R package data.table is unavailable.")
  if (!file.exists(req$bedPath) || !file.exists(req$gffPath)) stop("BED or annotation file is missing.")
  progress(15, "Loading transcript annotation records")
  annotation <- browser_local_annotation(req$gffPath)
  ex <- annotation$exons
  workspace_cache_path <- if ("workspaceCachePath" %in% names(req)) as.character(req$workspaceCachePath) else ""
  if (nzchar(workspace_cache_path)) {
    dir.create(dirname(workspace_cache_path), recursive = TRUE, showWarnings = FALSE)
    saveRDS(annotation, workspace_cache_path)
  }
  ex[, chrom := seqid]
  data.table::setkey(ex, chrom, start, end)
  attr(ex, "browser_transcript_id_key_index") <- browser_build_transcript_id_key_index(ex)
  progress(66, "Loading staged BED intervals")
  bed <- data.table::fread(req$bedPath, sep = "\t", header = FALSE, fill = TRUE, data.table = TRUE)
  if (ncol(bed) < 3 || !nrow(bed)) stop("BED contains no intervals.")
  progress(78, "Computing BED and transcript exon overlaps")
  rows <- browser_map_bed_to_transcript_rows(bed, list(file_path = req$bedPath), 1L, ex)
  if (nrow(rows)) {
    rows[, `:=`(chrom = browser_canonical_chr_vector(bed_col_1), start = as.integer(bed_col_2), end = as.integer(bed_col_3))]
    cols <- c("row_key", "chrom", "start", "end", "transcript_interval", "transcript_id", "gene_id",
      "transcript_length", "overlap_bases", grep("^bed_col_", names(rows), value = TRUE))
    rows <- rows[, ..cols]
  }
  progress(100, "Finalizing transcript mapping results")
  write_result(list(status = "ok", rows = rows, total = nrow(rows), workspaceCachePath = workspace_cache_path,
    workspaceGffPath = req$gffPath))
}, error = function(err) fail(conditionMessage(err)))
quit(save = "no", status = 0L, runLast = FALSE)
