args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) stop("Usage: structure_fold_runner.R request.json response.json")

request <- jsonlite::fromJSON(args[[1]], simplifyVector = FALSE)
response_path <- args[[2]]
write_result <- function(value) {
  jsonlite::write_json(value, response_path, auto_unbox = TRUE, na = "null")
}
fail <- function(message) {
  write_result(list(status = "error", message = message))
  quit(save = "no", status = 0)
}
progress <- function(value, detail) {
  cat(sprintf("[structure][%d%%] %s\n", as.integer(value), detail))
  flush.console()
}

required <- c("fastaPath", "rnafoldPath", "transcriptId", "interval")
if (!all(required %in% names(request))) fail("Structure request is incomplete.")
if (!file.exists(request$fastaPath)) fail("Transcript FASTA is missing.")
if (!file.exists(request$rnafoldPath)) fail("Bundled RNAfold executable is missing.")

progress(12, "Reading the transcript sequence")
fasta_lines <- readLines(request$fastaPath, warn = FALSE)
sequence <- paste(fasta_lines[!startsWith(fasta_lines, ">")], collapse = "")
sequence <- toupper(gsub("[^ACGTUN]", "", sequence))
sequence <- chartr("T", "U", sequence)
if (!nzchar(sequence)) fail("Transcript FASTA contains no RNA sequence.")

interval_match <- regmatches(
  as.character(request$interval),
  regexec("^([0-9]+)-([0-9]+)$", as.character(request$interval))
)[[1]]
if (length(interval_match) != 3) fail("Selected transcript interval is invalid.")
highlight_start <- max(1L, suppressWarnings(as.integer(interval_match[[2]])))
highlight_end <- min(nchar(sequence), suppressWarnings(as.integer(interval_match[[3]])))
if (!is.finite(highlight_start) || !is.finite(highlight_end) || highlight_end < highlight_start) {
  fail("Selected transcript interval is outside the transcript sequence.")
}

progress(38, sprintf("Folding %d nt with the bundled RNAfold runtime", nchar(sequence)))
input_path <- tempfile(pattern = "rnameta_structure_", fileext = ".fa")
writeLines(c(paste0(">", request$transcriptId), sequence), input_path, useBytes = TRUE)
on.exit(unlink(input_path, force = TRUE), add = TRUE)

output <- tryCatch(
  system2(
    command = request$rnafoldPath,
    args = c("--noPS", shQuote(input_path)),
    stdout = TRUE,
    stderr = TRUE
  ),
  error = function(error) structure(list(), error_message = conditionMessage(error))
)
if (!is.null(attr(output, "error_message"))) fail(attr(output, "error_message"))

structure_lines <- output[grepl("^[().]+[[:space:]]+\\(", output)]
if (!length(structure_lines)) {
  fail(paste("RNAfold returned no parseable dot-bracket structure.", paste(tail(output, 6), collapse = " | ")))
}
fold_line <- tail(structure_lines, 1)
fold_match <- regmatches(fold_line, regexec("^([().]+)[[:space:]]+\\([[:space:]]*([-+0-9.eE]+)", fold_line))[[1]]
if (length(fold_match) < 2 || nchar(fold_match[[2]]) != nchar(sequence)) {
  fail("RNAfold output length does not match the transcript sequence.")
}

progress(92, "Preparing the local structure visualization")
write_result(list(
  status = "ok",
  transcriptId = as.character(request$transcriptId),
  transcriptLength = nchar(sequence),
  interval = as.character(request$interval),
  sequence = sequence,
  structure = fold_match[[2]],
  energy = if (length(fold_match) >= 3) suppressWarnings(as.numeric(fold_match[[3]])) else NULL,
  method = "RNAfold 2.7.2",
  highlightStart = highlight_start,
  highlightEnd = highlight_end,
  highlights = list(list(
    start = highlight_start,
    end = highlight_end,
    label = "BED overlap",
    color = "#c98468"
  ))
))
progress(100, "Structure is ready")
