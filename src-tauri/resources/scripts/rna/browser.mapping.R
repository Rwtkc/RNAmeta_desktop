# Numerical transcript mapping kernels from deployed RNAmeta Online.
`%||%` <- function(x, y) if (is.null(x)) y else x
browser_canonical_chr_vector <- function(x) sub("^chr", "", as.character(x), ignore.case = TRUE)

structure_strip_gff_prefix <- function(value) {
  value <- trimws(as.character(value %||% ""))
  value[is.na(value)] <- ""
  encoded <- grepl("%", value, fixed = TRUE)
  value[encoded] <- utils::URLdecode(value[encoded])
  gsub("^(gene|transcript|mRNA|rna|exon|cds):", "", value, ignore.case = TRUE)
}

structure_id_keys <- function(value) {
  value <- structure_strip_gff_prefix(value)
  value <- value[nzchar(value)]
  if (!length(value)) {
    return(character())
  }

  unique(c(value, sub("\\.[0-9]+$", "", value)))
}

browser_empty_transcript_table <- function() {
  data.table::data.table(
    row_key = character(),
    source_file = character(),
    source_file_index = integer(),
    source_row = integer(),
    transcript_interval = character(),
    transcript_id = character(),
    gene_id = character(),
    transcript_length = integer(),
    igv_locus = character(),
    overlap_bases = integer()
  )
}

browser_transcript_locus <- function(transcript_id, transcript_length) {
  transcript_id <- as.character(transcript_id %||% "")[[1]]
  transcript_length <- suppressWarnings(as.integer(transcript_length))
  if (!nzchar(transcript_id) || !is.finite(transcript_length) || transcript_length < 1L) {
    return("")
  }

  sprintf("%s:1-%s", transcript_id, transcript_length)
}

browser_transcript_id_key_rows <- function(values, identifiers, identifier_column) {
  if (!exists("structure_strip_gff_prefix", mode = "function")) {
    result <- data.table::data.table(match_key = character())
    result[[identifier_column]] <- identifiers[FALSE]
    return(result)
  }

  values <- structure_strip_gff_prefix(values)
  keep <- nzchar(values)
  if (!any(keep)) {
    result <- data.table::data.table(match_key = character())
    result[[identifier_column]] <- identifiers[FALSE]
    return(result)
  }

  selected_values <- values[keep]
  selected_ids <- identifiers[keep]
  key_rows <- data.table::rbindlist(list(
    data.table::data.table(
      match_key = selected_values,
      identifier = selected_ids
    ),
    data.table::data.table(
      match_key = sub("\\.[0-9]+$", "", selected_values),
      identifier = selected_ids
    )
  ), use.names = TRUE)
  data.table::setnames(key_rows, "identifier", identifier_column)
  unique(key_rows)
}

browser_build_transcript_id_key_index <- function(transcript_exons) {
  empty_index <- data.table::data.table(
    match_key = character(),
    transcript_id = character()
  )
  if (
    !exists("structure_id_keys", mode = "function") ||
      is.null(transcript_exons) ||
      !nrow(transcript_exons) ||
      !"transcript_id" %in% names(transcript_exons)
  ) {
    return(empty_index)
  }

  metadata <- unique(transcript_exons[, intersect(
    c("transcript_id", "gene_id", "transcript_name"),
    names(transcript_exons)
  ), with = FALSE])
  if (!nrow(metadata)) {
    return(empty_index)
  }

  key_rows <- lapply(c("transcript_id", "gene_id", "transcript_name"), function(column) {
    values <- if (column %in% names(metadata)) metadata[[column]] else rep("", nrow(metadata))
    browser_transcript_id_key_rows(values, metadata$transcript_id, "transcript_id")
  })
  index <- data.table::rbindlist(key_rows, use.names = TRUE, fill = TRUE)
  if (!nrow(index)) {
    return(empty_index)
  }

  unique(index[, .(match_key, transcript_id)])
}

browser_map_bed_to_transcript_rows <- function(
  bed,
  file_entry,
  file_index,
  transcript_exons,
  transcript_id_key_index = NULL
) {
  if (ncol(bed) < 3 || !nrow(bed) || !nrow(transcript_exons)) {
    return(browser_empty_transcript_table())
  }

  original_col_count <- ncol(bed)
  original_cols <- data.table::data.table(row_id = seq_len(nrow(bed)))
  for (col_index in seq_len(original_col_count)) {
    original_cols[[paste0("bed_col_", col_index)]] <- as.character(bed[[col_index]])
  }

  bed_ranges <- data.table::data.table(
    row_id = seq_len(nrow(bed)),
    chrom = browser_canonical_chr_vector(bed[[1]]),
    start = suppressWarnings(as.integer(bed[[2]])) + 1L,
    end = suppressWarnings(as.integer(bed[[3]])),
    bed_name = if (original_col_count >= 4) as.character(bed[[4]]) else "",
    bed_strand = if (original_col_count >= 6) as.character(bed[[6]]) else "."
  )
  bed_ranges <- bed_ranges[is.finite(start) & is.finite(end) & end >= start & nzchar(chrom)]

  if (!nrow(bed_ranges)) {
    return(browser_empty_transcript_table())
  }

  overlap_exons <- transcript_exons
  if (!identical(data.table::key(overlap_exons), c("chrom", "start", "end"))) {
    overlap_exons <- data.table::copy(transcript_exons)
    data.table::setkey(overlap_exons, chrom, start, end)
  }
  data.table::setkey(bed_ranges, chrom, start, end)
  hits <- data.table::foverlaps(
    bed_ranges,
    overlap_exons,
    by.x = c("chrom", "start", "end"),
    by.y = c("chrom", "start", "end"),
    type = "any",
    nomatch = 0L
  )

  if (!nrow(hits)) {
    return(browser_empty_transcript_table())
  }

  bed_start_col <- if ("i.start" %in% names(hits)) "i.start" else "start"
  bed_end_col <- if ("i.end" %in% names(hits)) "i.end" else "end"
  hits[, bed_start := get(bed_start_col)]
  hits[, bed_end := get(bed_end_col)]
  hits[, overlap_start := pmax(start, bed_start)]
  hits[, overlap_end := pmin(end, bed_end)]
  hits[, overlap_bases := pmax(0L, overlap_end - overlap_start + 1L)]
  hits <- hits[overlap_bases > 0L & nzchar(transcript_id)]

  if (!nrow(hits)) {
    return(browser_empty_transcript_table())
  }

  hits[, highlight_start := ifelse(
    strand == "-",
    cumulative_before + (end - overlap_end + 1L),
    cumulative_before + (overlap_start - start + 1L)
  )]
  hits[, highlight_end := ifelse(
    strand == "-",
    cumulative_before + (end - overlap_start + 1L),
    cumulative_before + (overlap_end - start + 1L)
  )]
  hits[, transcript_interval_start := as.integer(pmin(highlight_start, highlight_end))]
  hits[, transcript_interval_end := as.integer(pmax(highlight_start, highlight_end))]

  mapped <- hits[, .(
    overlap_bases = as.integer(sum(overlap_bases, na.rm = TRUE)),
    chrom = chrom[[1]],
    strand = strand[[1]],
    gene_id = gene_id[[1]] %||% "",
    transcript_name = transcript_name[[1]] %||% "",
    transcript_length = as.integer(transcript_length[[1]])
  ), by = .(row_id, transcript_id, transcript_interval_start, transcript_interval_end)]

  bed_meta <- bed_ranges[, .(row_id, bed_name, bed_strand)]
  mapped <- merge(mapped, bed_meta, by = "row_id", all.x = TRUE, sort = FALSE)
  mapped[, name_score := 0L]
  if (is.null(transcript_id_key_index)) {
    transcript_id_key_index <- attr(transcript_exons, "browser_transcript_id_key_index")
  }
  if (
    exists("structure_id_keys", mode = "function") &&
      !is.null(transcript_id_key_index) &&
      nrow(transcript_id_key_index)
  ) {
    bed_id_key_index <- browser_transcript_id_key_rows(
      mapped$bed_name,
      mapped$row_id,
      "row_id"
    )
    if (nrow(bed_id_key_index)) {
      name_hits <- unique(merge(
        bed_id_key_index,
        transcript_id_key_index,
        by = "match_key",
        allow.cartesian = TRUE
      )[, .(row_id, transcript_id)])
      if (nrow(name_hits)) {
        mapped[name_hits, on = .(row_id, transcript_id), name_score := 1L]
      }
    }
  }
  mapped[, strand_score := as.integer(bed_strand %in% c("+", "-") & bed_strand == strand)]
  mapped[, transcript_overlap_bases := as.integer(sum(overlap_bases, na.rm = TRUE)), by = .(row_id, transcript_id)]
  data.table::setorder(mapped, row_id, -name_score, -strand_score, -transcript_overlap_bases, transcript_id, transcript_interval_start, transcript_interval_end)
  mapped[, segment_index := seq_len(.N), by = .(row_id, transcript_id)]
  mapped[, transcript_interval := sprintf("%s-%s", transcript_interval_start, transcript_interval_end)]
  mapped[, igv_locus := mapply(browser_transcript_locus, transcript_id, transcript_length, USE.NAMES = FALSE)]
  mapped[, row_key := sprintf("f%s_r%s_tx%s_seg%s", file_index, row_id, transcript_id, segment_index)]
  mapped[, source_file := file_entry$file_name %||% basename(file_entry$file_path)]
  mapped[, source_file_index := as.integer(file_index)]
  mapped[, source_row := as.integer(row_id)]

  mapped <- merge(mapped, original_cols, by.x = "row_id", by.y = "row_id", all.x = TRUE, sort = FALSE)
  data.table::setorder(mapped, row_id, -name_score, -strand_score, -transcript_overlap_bases, transcript_id, segment_index)

  keep <- c(
    "row_key", "source_file", "source_file_index", "source_row", "transcript_interval", "transcript_id",
    "gene_id", "transcript_length", "igv_locus", "overlap_bases",
    paste0("bed_col_", seq_len(original_col_count))
  )
  mapped[, keep, with = FALSE]
}
