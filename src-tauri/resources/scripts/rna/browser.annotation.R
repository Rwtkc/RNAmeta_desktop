# Desktop GFF3/GTF adapter for the Online transcript mapping kernels.
browser_read_annotation <- function(path) {
  con <- if (grepl("\\.gz$", path, ignore.case = TRUE)) gzfile(path) else file(path)
  on.exit(close(con), add = TRUE)
  lines <- readLines(con, warn = FALSE)
  lines <- lines[nzchar(lines) & !startsWith(lines, "#")]
  if (!length(lines)) return(data.table::data.table())
  x <- data.table::fread(text = paste(lines, collapse = "\n"), sep = "\t", header = FALSE,
    quote = "", fill = TRUE, data.table = TRUE)
  data.table::setnames(x, c("seqid", "source", "type", "start", "end", "score", "strand", "phase", "attributes"))
  x[, `:=`(seqid = browser_canonical_chr_vector(seqid), start = as.integer(start), end = as.integer(end))]
  x[is.finite(start) & is.finite(end) & end >= start & nzchar(seqid)]
}

browser_annotation_attribute <- function(value, primary, fallback = primary) {
  extract <- function(key) {
    a <- regmatches(value, regexec(paste0('(?:^|;)\\s*', key, '=([^;]+)'), value, perl = TRUE))
    b <- regmatches(value, regexec(paste0('(?:^|;)\\s*', key, '\\s+"([^"]+)"'), value, perl = TRUE))
    get <- function(x) vapply(x, function(m) if (length(m) > 1L) m[[2L]] else "", character(1))
    x <- get(a); y <- get(b)
    ifelse(nzchar(x), x, y)
  }
  x <- extract(primary); y <- extract(fallback)
  ifelse(nzchar(x), x, y)
}

browser_expand_annotation_parents <- function(rows) {
  if (!nrow(rows)) return(rows)
  parents <- strsplit(browser_annotation_attribute(rows$attributes, "Parent", "transcript_id"), ",", fixed = TRUE)
  rows <- rows[rep(seq_len(nrow(rows)), lengths(parents))]
  rows[, transcript_id := structure_strip_gff_prefix(unlist(parents, use.names = FALSE))]
  rows[nzchar(transcript_id)]
}

browser_local_annotation <- function(path) {
  gff <- browser_read_annotation(path)
  if (!nrow(gff)) stop("Annotation contains no records.")
  tx <- gff[tolower(type) %in% c("mrna", "transcript", "ncrna", "lnc_rna", "rrna", "trna", "snrna", "snorna", "mirna") |
    grepl("(^|;)ID=transcript:", attributes, ignore.case = TRUE)]
  tx[, transcript_id := structure_strip_gff_prefix(browser_annotation_attribute(attributes, "ID", "transcript_id"))]
  tx[, gene_id := structure_strip_gff_prefix(browser_annotation_attribute(attributes, "Parent", "gene_id"))]
  tx[, transcript_name := browser_annotation_attribute(attributes, "Name", "transcript_name")]
  tx <- unique(tx[nzchar(transcript_id), .(transcript_id, gene_id, transcript_name)], by = "transcript_id")
  ex <- browser_expand_annotation_parents(gff[tolower(type) == "exon"])
  if (!nrow(ex)) stop("Annotation has no exon records.")
  ex <- merge(ex[, .(seqid, start, end, strand, transcript_id)], tx, by = "transcript_id", all.x = TRUE, sort = FALSE)
  ex[is.na(gene_id), gene_id := ""]
  ex[is.na(transcript_name), transcript_name := ""]
  ex[, `:=`(sort_start = ifelse(strand == "-", -start, start), sort_end = ifelse(strand == "-", -end, end))]
  data.table::setorder(ex, transcript_id, sort_start, sort_end)
  ex[, exon_width := end - start + 1L]
  ex[, cumulative_before := cumsum(data.table::shift(exon_width, fill = 0L)), by = transcript_id]
  ex[, transcript_length := sum(exon_width), by = transcript_id]
  cds <- browser_expand_annotation_parents(gff[tolower(type) == "cds"])
  list(exons = ex, cds = cds)
}
