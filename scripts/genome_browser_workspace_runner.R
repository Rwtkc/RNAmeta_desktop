args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) stop("Usage: genome_browser_workspace_runner.R request.json response.json")
req <- jsonlite::fromJSON(args[[1]])
out_path <- args[[2]]
write_result <- function(value) jsonlite::write_json(value, out_path, auto_unbox = TRUE, dataframe = "rows", na = "null")
fail <- function(message) { write_result(list(status = "error", message = message)); quit(save = "no", status = 0) }
if (!requireNamespace("data.table", quietly = TRUE)) fail("R package data.table is unavailable.")
required <- c("gffPath", "fastaPath", "transcriptId", "interval", "outputBase")
if (!all(required %in% names(req))) fail("Transcript workspace request is incomplete.")
if (!file.exists(req$gffPath) || !file.exists(req$fastaPath)) fail("TAIR10 GFF3 or FASTA file is missing.")
read_gff <- function(path) {
  lines <- readLines(gzfile(path), warn = FALSE)
  lines <- lines[nzchar(lines) & !startsWith(lines, "#")]
  if (!length(lines)) return(data.table::data.table())
  x <- data.table::fread(text = paste(lines, collapse = "\n"), sep = "\t", header = FALSE, quote = "", fill = TRUE, data.table = TRUE)
  data.table::setnames(x, c("seqid", "source", "type", "start", "end", "score", "strand", "phase", "attributes"))
  x[, `:=`(start = as.integer(start), end = as.integer(end))]
  x
}
attr_value <- function(value, key) {
  hit <- regmatches(value, regexec(paste0("(?:^|;)", key, "=([^;]+)"), value, perl = TRUE))
  vapply(hit, function(m) if (length(m) > 1) m[[2]] else "", character(1))
}
canonical <- function(value) sub("^chr", "", sub("^Chr", "", as.character(value)))
reverse_complement <- function(value) chartr("ACGTNacgtn", "TGCANtgcan", paste(rev(strsplit(value, "", fixed = TRUE)[[1]]), collapse = ""))
fasta_cache <- new.env(parent = emptyenv())
fasta_index_cache <- new.env(parent = emptyenv())
read_fasta_seq <- function(path, target) {
  cache_key <- paste(path, target, sep = "::")
  if (exists(cache_key, envir = fasta_cache, inherits = FALSE)) return(get(cache_key, envir = fasta_cache, inherits = FALSE))
  lines <- readLines(path, warn = FALSE); headers <- which(startsWith(lines, ">"))
  if (!length(headers)) return("")
  names <- sub("^>([^[:space:]]+).*", "\\1", lines[headers])
  hit <- which(names == target | canonical(names) == canonical(target))[[1]]
  end <- if (hit < length(headers)) headers[[hit + 1]] - 1L else length(lines)
  sequence <- paste(lines[(headers[[hit]] + 1L):end], collapse = "")
  assign(cache_key, sequence, envir = fasta_cache)
  sequence
}
read_fasta_interval <- function(path, target, start, end) {
  start <- suppressWarnings(as.integer(start)); end <- suppressWarnings(as.integer(end))
  if (!is.finite(start) || !is.finite(end) || end < start) return("")
  index_path <- paste0(path, ".fai")
  if (!file.exists(index_path)) return(substr(read_fasta_seq(path, target), start, end))
  index_key <- paste(path, "__index", sep = "::")
  if (exists(index_key, envir = fasta_index_cache, inherits = FALSE)) {
    index <- get(index_key, envir = fasta_index_cache, inherits = FALSE)
  } else {
    index <- data.table::fread(index_path, header = FALSE, sep = "\t", data.table = TRUE)
    data.table::setnames(index, c("name", "length", "offset", "line_bases", "line_width"))
    assign(index_key, index, envir = fasta_index_cache)
  }
  hit <- which(index$name == target | canonical(index$name) == canonical(target))
  if (!length(hit)) return("")
  row <- index[hit[[1L]]]
  start <- max(1L, min(as.integer(row$length[[1]]), start))
  end <- max(start, min(as.integer(row$length[[1]]), end))
  line_bases <- as.numeric(row$line_bases[[1]])
  line_width <- as.numeric(row$line_width[[1]])
  byte_offset <- as.numeric(row$offset[[1]]) + ((start - 1) %/% line_bases) * line_width + ((start - 1) %% line_bases)
  remaining <- end - start + 1L
  connection <- file(path, open = "rb")
  on.exit(close(connection), add = TRUE)
  seek(connection, where = byte_offset, origin = "start")
  pieces <- character()
  while (remaining > 0L) {
    line <- readLines(connection, n = 1L, warn = FALSE)
    if (!length(line)) break
    line <- gsub("[[:space:]]", "", line)
    take <- substr(line, 1L, min(remaining, nchar(line)))
    pieces <- c(pieces, take)
    remaining <- remaining - nchar(take)
  }
  paste(pieces, collapse = "")
}
parse_interval <- function(value) {
  match <- regmatches(as.character(value), regexec("^([0-9]+)-([0-9]+)$", as.character(value)))[[1]]
  if (length(match) != 3) return(c(NA_integer_, NA_integer_))
  as.integer(match[2:3])
}
tx_id <- as.character(req$transcriptId)
workspace_cache_path <- if ("workspaceCachePath" %in% names(req)) as.character(req$workspaceCachePath) else ""
cached_annotation <- if (nzchar(workspace_cache_path) && file.exists(workspace_cache_path)) tryCatch(readRDS(workspace_cache_path), error = function(e) NULL) else NULL
if (!is.null(cached_annotation) && is.data.frame(cached_annotation$exons)) {
  ex <- data.table::as.data.table(cached_annotation$exons)[transcript_id == tx_id]
  cds <- data.table::as.data.table(if (is.null(cached_annotation$cds)) data.frame() else cached_annotation$cds)
  if (nrow(cds) && "transcript_id" %in% names(cds)) cds <- cds[transcript_id == tx_id]
} else {
  gff <- read_gff(req$gffPath)
  if (!nrow(gff)) fail("GFF3 contains no records.")
  gff[, seqid := canonical(seqid)]
  ex <- gff[type == "exon"]
  ex[, transcript_id := sub("^transcript:", "", attr_value(attributes, "Parent"))]
  ex[, exon_width := end - start + 1L]
  ex[, sort_start := ifelse(strand == "-", -start, start)]
  data.table::setorder(ex, transcript_id, sort_start)
  ex[, cumulative_before := cumsum(data.table::shift(exon_width, fill = 0L)), by = transcript_id]
  ex[, transcript_length := sum(exon_width), by = transcript_id]
  cds <- gff[type == "CDS"]
  if (nrow(cds)) {
    cds[, transcript_id := sub("^transcript:", "", attr_value(attributes, "Parent"))]
  }
  cds <- cds[transcript_id == tx_id]
}
if (!nrow(ex)) fail(sprintf("Transcript '%s' was not found in GFF3.", tx_id))
strand <- as.character(ex$strand[[1]])
ex[, sort_start := ifelse(strand == "-", -start, start)]
data.table::setorder(ex, sort_start)
sequence_parts <- vapply(seq_len(nrow(ex)), function(i) {
  fragment <- read_fasta_interval(req$fastaPath, ex$seqid[[i]], ex$start[[i]], ex$end[[i]])
  if (strand == "-") reverse_complement(fragment) else fragment
}, character(1))
sequence <- paste(sequence_parts, collapse = "")
if (!nzchar(sequence)) fail(sprintf("No sequence was found for transcript '%s'.", tx_id))
dir.create(dirname(req$outputBase), recursive = TRUE, showWarnings = FALSE)
fasta_path <- paste0(req$outputBase, ".fa"); fai_path <- paste0(fasta_path, ".fai")
bed_path <- paste0(req$outputBase, ".bed"); cytoband_path <- paste0(req$outputBase, ".cytoband.txt")
line_width <- 60L; starts <- seq.int(1L, nchar(sequence), by = line_width)
seq_lines <- substring(sequence, starts, pmin(starts + line_width - 1L, nchar(sequence)))
writeLines(c(paste0(">", tx_id), seq_lines), fasta_path, useBytes = TRUE)
writeLines(paste(tx_id, nchar(sequence), nchar(tx_id, type = "bytes") + 2L, line_width, line_width + 1L, sep = "\t"), fai_path, useBytes = TRUE)
interval <- parse_interval(req$interval)
if (!all(is.finite(interval))) fail("Selected transcript interval is invalid.")
bed <- data.frame(chrom = tx_id, start = interval[[1]] - 1L, end = interval[[2]], name = paste0(tx_id, ":", interval[[1]], "-", interval[[2]]), score = 0L, strand = "+")
write.table(bed, bed_path, sep = "\t", quote = FALSE, row.names = FALSE, col.names = FALSE)
cds_tx <- integer()
if (nrow(cds)) for (i in seq_len(nrow(cds))) for (j in seq_len(nrow(ex))) {
  if (canonical(cds$seqid[[i]]) != canonical(ex$seqid[[j]]) || cds$end[[i]] < ex$start[[j]] || cds$start[[i]] > ex$end[[j]]) next
  os <- max(cds$start[[i]], ex$start[[j]]); oe <- min(cds$end[[i]], ex$end[[j]])
  a <- if (strand == "-") ex$cumulative_before[[j]] + ex$end[[j]] - oe + 1L else ex$cumulative_before[[j]] + os - ex$start[[j]] + 1L
  b <- if (strand == "-") ex$cumulative_before[[j]] + ex$end[[j]] - os + 1L else ex$cumulative_before[[j]] + oe - ex$start[[j]] + 1L
  cds_tx <- c(cds_tx, min(a, b), max(a, b))
}
tx_len <- nchar(sequence)
if (length(cds_tx)) {
  cds_start <- max(1L, min(cds_tx)); cds_end <- min(tx_len, max(cds_tx))
  bands <- rbind(if (cds_start > 1L) data.frame(chrom = tx_id, start = 0L, end = cds_start - 1L, name = "5'UTR", stain = "gpos50"), data.frame(chrom = tx_id, start = cds_start - 1L, end = cds_end, name = "CDS", stain = "gneg"), if (cds_end < tx_len) data.frame(chrom = tx_id, start = cds_end, end = tx_len, name = "3'UTR", stain = "gpos50"))
} else bands <- data.frame(chrom = tx_id, start = 0L, end = tx_len, name = "Transcript", stain = "gpos50")
write.table(bands, cytoband_path, sep = "\t", quote = FALSE, row.names = FALSE, col.names = FALSE)
segments <- lapply(seq_len(nrow(bands)), function(i) list(label = bands$name[[i]], start = bands$start[[i]], end = bands$end[[i]]))
write_result(list(status = "ok", transcriptId = tx_id, transcriptLength = tx_len, fastaPath = fasta_path, faiPath = fai_path, bedPath = bed_path, cytobandPath = cytoband_path, segments = segments))
