args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) stop("Usage: genome_browser_mapping_runner.R request.json response.json")
request_path <- args[[1]]; response_path <- args[[2]]
req <- jsonlite::fromJSON(request_path)
write_result <- function(value) jsonlite::write_json(value, response_path, auto_unbox = TRUE, dataframe = "rows", na = "null")
fail <- function(message) { write_result(list(status = "error", message = message, rows = list())); quit(save = "no", status = 0) }
progress <- function(value, detail) message(sprintf("[genome-browser-mapping][%s%%] %s", value, detail))
progress(5, "Validating staged BED and annotation inputs")
if (!requireNamespace("data.table", quietly = TRUE)) fail("R package data.table is unavailable.")
bed_path <- req$bedPath; gff_path <- req$gffPath
if (!file.exists(bed_path) || !file.exists(gff_path)) fail("BED or annotation file is missing.")
read_gff <- function(path) {
  connection <- if (grepl("\\.gz$", path, ignore.case = TRUE)) gzfile(path) else file(path)
  on.exit(close(connection), add = TRUE)
  lines <- readLines(connection, warn = FALSE)
  lines <- lines[nzchar(lines) & !startsWith(lines, "#")]
  if (!length(lines)) return(data.table::data.table())
  x <- data.table::fread(text = paste(lines, collapse = "\n"), sep = "\t", header = FALSE, quote = "", fill = TRUE, data.table = TRUE)
  data.table::setnames(x, c("seqid", "source", "type", "start", "end", "score", "strand", "phase", "attributes"))
  x
}
parse_attr <- function(value, key) {
  gff_hit <- regmatches(value, regexec(paste0("(?:^|;)\\s*", key, "=([^;]+)"), value, perl = TRUE))
  gff_value <- vapply(gff_hit, function(m) if (length(m) > 1) m[[2]] else "", character(1))
  gtf_hit <- regmatches(value, regexec(paste0('(?:^|;)\\s*', key, '\\s+"([^\"]+)"'), value, perl = TRUE))
  gtf_value <- vapply(gtf_hit, function(m) if (length(m) > 1) m[[2]] else "", character(1))
  ifelse(nzchar(gff_value), gff_value, gtf_value)
}
first_attr <- function(value, primary, fallback) {
  primary_value <- parse_attr(value, primary)
  fallback_value <- parse_attr(value, fallback)
  ifelse(nzchar(primary_value), primary_value, fallback_value)
}
progress(15, "Loading transcript annotation records")
gff <- read_gff(gff_path)
if (!nrow(gff)) fail("Annotation contains no records.")
canonical_chr <- function(value) {
  value <- as.character(value)
  value <- sub("^chr", "", value, ignore.case = TRUE)
  sub("^Chr", "", value, ignore.case = TRUE)
}
gff[, seqid := canonical_chr(seqid)]
gff[, `:=`(start = as.integer(start), end = as.integer(end))]
tx <- gff[type %in% c("mRNA", "transcript")]
ex <- gff[type == "exon"]
if (!nrow(tx) || !nrow(ex)) fail("Annotation has no transcript/exon records.")
tx[, transcript_id := first_attr(attributes, "ID", "transcript_id")]
tx[, transcript_id := sub("^transcript:", "", transcript_id)]
tx[, gene_id := first_attr(attributes, "Parent", "gene_id")]
ex[, transcript_id := first_attr(attributes, "Parent", "transcript_id")]
ex[, transcript_id := sub("^transcript:", "", transcript_id)]
ex <- ex[nzchar(transcript_id)]
ex <- merge(ex[, .(seqid, start, end, strand, transcript_id)], tx[, .(transcript_id, gene_id)], by = "transcript_id", all.x = TRUE)
ex[, sort_start := ifelse(strand == "-", -start, start)]
data.table::setorder(ex, transcript_id, sort_start)
ex[, exon_width := end - start + 1L]
ex[, cumulative_before := cumsum(data.table::shift(exon_width, fill = 0L)), by = transcript_id]
ex[, transcript_length := sum(exon_width), by = transcript_id]
progress(42, "Constructing transcript and exon coordinate maps")
workspace_cache_path <- if ("workspaceCachePath" %in% names(req)) as.character(req$workspaceCachePath) else ""
if (nzchar(workspace_cache_path)) {
  dir.create(dirname(workspace_cache_path), recursive = TRUE, showWarnings = FALSE)
  cds_cache <- gff[type == "CDS", .(seqid, start, end, strand, attributes)]
  if (nrow(cds_cache)) cds_cache[, transcript_id := sub("^transcript:", "", first_attr(attributes, "Parent", "transcript_id"))]
  saveRDS(list(exons = ex[, .(seqid, start, end, strand, transcript_id, exon_width, cumulative_before, transcript_length)], cds = cds_cache), workspace_cache_path)
}
progress(58, "Caching transcript annotations for fast IGV workspace loading")
progress(66, "Loading staged BED intervals")
bed <- data.table::fread(bed_path, sep = "\t", header = FALSE, fill = TRUE, data.table = TRUE)
if (ncol(bed) < 3 || !nrow(bed)) fail("BED contains no intervals.")
data.table::setnames(bed, paste0("bed_col_", seq_len(ncol(bed))))
bed_cols <- grep("^bed_col_[0-9]+$", names(bed), value = TRUE)
bed[, `:=`(row_id = .I, chrom = as.character(bed_col_1), start = as.integer(bed_col_2) + 1L, end = as.integer(bed_col_3))]
bed[, chrom := canonical_chr(chrom)]
bed_values <- bed[, c("row_id", bed_cols), with = FALSE]
data.table::setkey(ex, seqid, start, end)
data.table::setkey(bed, chrom, start, end)
progress(78, "Computing BED and transcript exon overlaps")
hits <- data.table::foverlaps(bed[, .(row_id, chrom, start, end)], ex, by.x = c("chrom", "start", "end"), by.y = c("seqid", "start", "end"), type = "any", nomatch = 0L)
if (!nrow(hits)) { progress(100, "Finalizing empty mapping result"); write_result(list(status = "ok", rows = list(), total = 0L, workspaceCachePath = workspace_cache_path, workspaceGffPath = gff_path)); quit(save = "no", status = 0) }
hits <- merge(hits, bed_values, by = "row_id", all.x = TRUE, sort = FALSE)
hits[, `:=`(overlap_start = pmax(start, i.start), overlap_end = pmin(end, i.end))]
hits <- hits[overlap_end >= overlap_start]
hits[, `:=`(tx_start = ifelse(strand == "-", cumulative_before + (end - overlap_end + 1L), cumulative_before + (overlap_start - start + 1L)), tx_end = ifelse(strand == "-", cumulative_before + (end - overlap_start + 1L), cumulative_before + (overlap_end - start + 1L)))]
data.table::setorder(hits, row_id, transcript_id, tx_start)
hits[, segment_index := seq_len(.N), by = .(row_id, transcript_id)]
hits[, row_key := sprintf("r%s_%s_%s", row_id, transcript_id, segment_index)]
progress(94, "Formatting transcript overlap rows")
rows <- hits[, c(list(row_key = row_key, chrom = chrom, start = as.integer(bed_col_2), end = as.integer(bed_col_3), transcript_interval = sprintf("%s-%s", pmin(tx_start, tx_end), pmax(tx_start, tx_end)), transcript_id = transcript_id, gene_id = gene_id, transcript_length = transcript_length, overlap_bases = as.integer(overlap_end - overlap_start + 1L)), as.list(.SD)), .SDcols = bed_cols]
progress(100, "Finalizing transcript mapping results")
write_result(list(status = "ok", rows = rows, total = nrow(rows), workspaceCachePath = workspace_cache_path, workspaceGffPath = gff_path))
