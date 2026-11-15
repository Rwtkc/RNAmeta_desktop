peak_exon_group_palette <- function() {
  c("#de7a5b", "#859b7a", "#6676a0", "#c9886d", "#b9c78f")
}

peak_exon_location_levels <- function() {
  c("First", "Middle", "Last")
}

peak_exon_progress_update <- function(progress_callback, value, detail) {
  if (is.function(progress_callback)) {
    progress_callback(NULL, value, detail)
  }

  invisible(NULL)
}

peak_exon_require_saved_upload <- function(upload_context, module_label) {
  saved_files <- upload_run_context_saved_files(upload_context)

  if (is.null(upload_context) || !length(saved_files)) {
    stop(sprintf("Save a BED file in Upload / Run before running %s.", module_label))
  }

  if (is.null(upload_context$species) || !nzchar(upload_context$species)) {
    stop(sprintf("A species must be saved in Upload / Run before running %s.", module_label))
  }

  saved_files
}

peak_exon_load_annotation_bundle <- function(annotation_dir, species, species_id = NULL) {
  load_peak_distribution_annotation_bundle(
    annotation_dir = annotation_dir,
    species = species,
    species_id = species_id
  )
}

peak_exon_prepare_transcript_lookup <- function(txlens, exons = NULL) {
  txlens_dt <- data.table::as.data.table(txlens)

  if (!"tx_name" %in% names(txlens_dt)) {
    row_names <- rownames(as.data.frame(txlens))
    if (length(row_names) == nrow(txlens_dt) && any(nzchar(row_names))) {
      txlens_dt[, tx_name := row_names]
    }
  }

  if (!"nexon" %in% names(txlens_dt) && !is.null(exons)) {
    exon_counts <- data.table::data.table(
      tx_name = names(exons),
      nexon = S4Vectors::elementNROWS(exons)
    )
    txlens_dt <- merge(txlens_dt, exon_counts, by = "tx_name", all.x = TRUE)
  }

  txlens_dt[, tx_len := suppressWarnings(as.numeric(tx_len))]
  txlens_dt[, nexon := suppressWarnings(as.numeric(nexon))]
  unique(txlens_dt[, .(tx_name, tx_len, nexon)], by = "tx_name")
}

peak_exon_prepare_exon_ranges <- function(exons) {
  exon_ranges <- BiocGenerics::unlist(exons)
  exon_ranges$tx_name <- names(exon_ranges)
  exon_ranges$length <- IRanges::width(exon_ranges)

  exon_counts <- data.table::data.table(name = exon_ranges$tx_name)[, .N, by = name]
  exon_count_values <- exon_counts$N
  names(exon_count_values) <- exon_counts$name

  # exonsBy(..., by = "tx") supplies exon_rank in transcript order on both
  # strands. Reversing negative-strand ranks would swap First and Last.
  exon_ranges$rank <- as.integer(exon_ranges$exon_rank)

  exon_total <- unname(exon_count_values[as.character(exon_ranges$tx_name)])
  exon_loc <- rep("Middle", length(exon_ranges))
  exon_loc[exon_ranges$rank == 1] <- "First"
  exon_loc[!is.na(exon_total) & exon_ranges$rank == exon_total] <- "Last"

  exon_ranges$exonLoc <- factor(exon_loc, levels = peak_exon_location_levels())
  exon_ranges$exonID <- paste0(exon_ranges$tx_name, ":", exon_ranges$rank, recycle0 = TRUE)
  exon_ranges
}

peak_exon_prepare_transcript_ranges <- function(transcripts) {
  transcript_ranges <- transcripts

  if (!"tx_name" %in% names(S4Vectors::mcols(transcript_ranges))) {
    if ("tx_name" %in% names(S4Vectors::mcols(transcript_ranges))) {
      transcript_ranges$tx_name <- as.character(transcript_ranges$tx_name)
    } else if (!is.null(names(transcript_ranges)) && any(nzchar(names(transcript_ranges)))) {
      transcript_ranges$tx_name <- names(transcript_ranges)
    } else if ("tx_id" %in% names(S4Vectors::mcols(transcript_ranges))) {
      transcript_ranges$tx_name <- as.character(transcript_ranges$tx_id)
    } else {
      transcript_ranges$tx_name <- NA_character_
    }
  }

  transcript_ranges[!is.na(transcript_ranges$tx_name) & nzchar(transcript_ranges$tx_name)]
}

peak_exon_feature_bundle <- function(annotation_dir, species, species_id, txdb_features, annotation_bundle) {
  peak_exon_cached_feature_bundle(
    annotation_dir = annotation_dir,
    species = species,
    species_id = species_id,
    builder = function() {
      list(
        exon_ranges = peak_exon_prepare_exon_ranges(txdb_features$exons),
        transcript_ranges = peak_exon_prepare_transcript_ranges(txdb_features$transcripts),
        transcript_lookup = peak_exon_prepare_transcript_lookup(
          annotation_bundle$txlens,
          exons = txdb_features$exons
        )
      )
    }
  )
}

peak_exon_first_hit_subject_index <- function(peaks, feature_ranges) {
  overlaps <- GenomicRanges::findOverlaps(peaks, feature_ranges, ignore.strand = TRUE)

  if (!length(overlaps)) {
    return(integer())
  }

  subject_hits <- S4Vectors::subjectHits(overlaps[peak_distribution_first_hit_index(S4Vectors::queryHits(overlaps))])
  unique(subject_hits)
}

peak_exon_compute_transcript_stats <- function(peaks, transcript_ranges, transcript_lookup, sample_name) {
  subject_index <- peak_exon_first_hit_subject_index(peaks, transcript_ranges)

  if (!length(subject_index)) {
    return(data.table::data.table(
      tx_name = character(),
      tx_len = numeric(),
      nexon = numeric(),
      Sample = character()
    ))
  }

  transcript_ids <- unique(as.character(transcript_ranges$tx_name[subject_index]))
  transcript_stats <- transcript_lookup[tx_name %in% transcript_ids, .(tx_name, tx_len, nexon)]
  transcript_stats <- transcript_stats[!is.na(tx_name)]
  transcript_stats[, Sample := sample_name]
  transcript_stats[order(Sample, tx_name)]
}

peak_exon_compute_exon_size_data <- function(peaks, exon_ranges, sample_name) {
  subject_index <- peak_exon_first_hit_subject_index(peaks, exon_ranges)

  if (!length(subject_index)) {
    return(data.table::data.table(
      exonID = character(),
      tx_name = character(),
      rank = numeric(),
      length = numeric(),
      exonLoc = character(),
      Sample = character()
    ))
  }

  exon_info <- data.table::as.data.table(as.data.frame(S4Vectors::mcols(exon_ranges[subject_index])))
  output_columns <- intersect(
    c("exonID", "exon_id", "exon_name", "exon_rank", "tx_name", "length", "rank", "exonLoc"),
    names(exon_info)
  )
  exon_info <- unique(exon_info[, ..output_columns], by = "exonID")
  exon_info[, Sample := sample_name]
  exon_info[, exonLoc := factor(exonLoc, levels = peak_exon_location_levels())]
  exon_info[order(Sample, exonLoc, rank)]
}

peak_exon_collect_analysis_data <- function(
  upload_context,
  module_label,
  annotation_dir,
  progress_callback = NULL,
  include_exon_size = FALSE,
  include_transcript_stats = FALSE
) {
  saved_files <- peak_exon_require_saved_upload(upload_context, module_label)
  annotation_bundle <- peak_exon_load_annotation_bundle(
    annotation_dir = annotation_dir,
    species = upload_context$species,
    species_id = upload_context$species_id
  )
  txdb_features <- peak_distribution_cached_txdb_features(
    annotation_dir = annotation_dir,
    species = upload_context$species,
    species_id = upload_context$species_id,
    minimal_component_length = 100,
    builder = function() {
      peak_distribution_build_txdb_features(
        txdb = annotation_bundle$txdb,
        txlens_summary = annotation_bundle$txlens,
        minimal_component_length = 100
      )
    }
  )
  feature_bundle <- peak_exon_feature_bundle(
    annotation_dir = annotation_dir,
    species = upload_context$species,
    species_id = upload_context$species_id,
    txdb_features = txdb_features,
    annotation_bundle = annotation_bundle
  )
  sample_metadata <- rnameta_build_sample_metadata(saved_files)
  sample_names <- rnameta_sample_display_names(sample_metadata)
  interval_count <- 0L

  if (isTRUE(include_exon_size)) {
    exon_size_data_list <- vector("list", length(saved_files))
  } else {
    exon_size_data_list <- NULL
  }

  if (isTRUE(include_transcript_stats)) {
    transcript_stats_list <- vector("list", length(saved_files))
  } else {
    transcript_stats_list <- NULL
  }

  peak_exon_progress_update(progress_callback, 16, "Loading saved BED files and species exon annotation bundle")
  peak_exon_progress_update(progress_callback, 32, "Preparing transcript and exon feature structures from the TxDb bundle")

  for (index in seq_along(saved_files)) {
    file_info <- saved_files[[index]]
    sample_name <- sample_names[[index]]
    progress_value <- 42 + floor(index / length(saved_files) * 44)

    peak_exon_progress_update(
      progress_callback,
      progress_value,
      sprintf("Annotating exon-aware transcript hits for %s (%d/%d)", basename(file_info$file_name), index, length(saved_files))
    )

    raw_peaks <- peak_distribution_read_peaks(
      file_info$file_path,
      annotation_bundle$txdb,
      sample_name = sample_name
    )
    analysis_peaks <- GenomicRanges::resize(raw_peaks, width = 1, fix = "center")

    if (isTRUE(include_exon_size)) {
      exon_size_data_list[[index]] <- peak_exon_compute_exon_size_data(
        peaks = analysis_peaks,
        exon_ranges = feature_bundle$exon_ranges,
        sample_name = sample_name
      )
    }

    if (isTRUE(include_transcript_stats)) {
      transcript_stats_list[[index]] <- peak_exon_compute_transcript_stats(
        peaks = analysis_peaks,
        transcript_ranges = feature_bundle$transcript_ranges,
        transcript_lookup = feature_bundle$transcript_lookup,
        sample_name = sample_name
      )
    }

    interval_count <- interval_count + length(raw_peaks)
  }

  list(
    species = upload_context$species,
    sample_metadata = sample_metadata,
    sample_names = sample_names,
    sample_display_names = sample_names,
    sample_original_names = rnameta_sample_original_names(sample_metadata),
    sample_count = length(saved_files),
    interval_count = interval_count,
    exon_size_data = if (isTRUE(include_exon_size)) data.table::rbindlist(exon_size_data_list, use.names = TRUE, fill = TRUE) else NULL,
    transcript_stats = if (isTRUE(include_transcript_stats)) data.table::rbindlist(transcript_stats_list, use.names = TRUE, fill = TRUE) else NULL
  )
}
