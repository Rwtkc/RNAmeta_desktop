transcription_build_heatmap_panels <- function(source_file, species_key, peaks, windows, sample_name, original_name) {
  sampled_tss <- site_profile_evenly_sample_windows(windows$heatmap_tss, sample_n = 4000)
  sampled_tes <- site_profile_evenly_sample_windows(windows$heatmap_tes, sample_n = 4000)
  heatmap_targets <- site_profile_heatmap_peaks(peaks)
  tss_display_options <- list(
    rowHeightPx = 0.9,
    signalDefinition = "Coverage of a 15-nt window centred on each BED interval",
    cornerRadiusPx = 0,
    displayRowTarget = 384,
    renderScale = 6,
    backgroundColor = "#fffaf2",
    palette = c("#fff0d9", "#f7cf7a", "#ee9b4b", "#da6a33", "#b23a2c", "#7f1d1d"),
    colorMaxQuantile = 0.92
  )
  tes_display_options <- utils::modifyList(tss_display_options, list(displayRowTarget = 360))
  heatmap_cache_token <- site_profile_runtime_cache_key(
    "tss_rows", tss_display_options$displayRowTarget,
    "tes_rows", tes_display_options$displayRowTarget,
    "render_scale", tss_display_options$renderScale,
    "row_height", tss_display_options$rowHeightPx,
    "color_quantile", tss_display_options$colorMaxQuantile
  )

  site_profile_cached_heatmap_panels("transcription-transcript-boundaries-v2", source_file, species_key, windows$flank_size, function() {
    tss_matrix <- site_profile_score_matrix_rna(heatmap_targets, sampled_tss)
    tes_matrix <- site_profile_score_matrix_rna(heatmap_targets, sampled_tes)

    list(
      panels = list(
        site_profile_heatmap_panel(
          title = site_profile_heatmap_title_with_source("Transcription.Tss.Heatmap", original_name),
          tag_matrix = tss_matrix,
          x_positions = windows$x_positions,
          sample_name = sample_name,
          original_name = original_name,
          display_options = tss_display_options
        ),
        site_profile_heatmap_panel(
          title = site_profile_heatmap_title_with_source("Transcription.Tes.Heatmap", original_name),
          tag_matrix = tes_matrix,
          x_positions = windows$x_positions,
          sample_name = sample_name,
          original_name = original_name,
          display_options = tes_display_options
        )
      ),
      has_signal = transcription_matrix_has_signal(tss_matrix) || transcription_matrix_has_signal(tes_matrix)
    )
  }, cache_token = heatmap_cache_token)
}

run_transcription_analysis <- function(upload_context, controls = transcription_default_controls(), annotation_dir, progress = NULL) {
  saved_files <- site_profile_require_saved_upload(upload_context, "Transcription")
  controls <- utils::modifyList(transcription_default_controls(), controls)
  species_key <- if (!is.null(upload_context$species_id) && nzchar(upload_context$species_id)) upload_context$species_id else upload_context$species

  transcription_progress_update(progress, 12, "Loading saved BED files and species annotation bundle")
  annotation_bundle <- site_profile_load_annotation_bundle(
    annotation_dir = annotation_dir,
    species = upload_context$species,
    species_id = upload_context$species_id
  )
  transcription_progress_update(progress, 26, "Preparing cached transcription boundary windows")
  txdb_features <- site_profile_load_txdb_features(
    annotation_dir = annotation_dir,
    species = upload_context$species,
    species_id = upload_context$species_id,
    minimal_component_length = 100
  )
  windows <- site_profile_prepare_transcription_windows(
    species_key = species_key,
    txdb_features = txdb_features,
    txlens = annotation_bundle$txlens,
    flank_size = controls$flank_size
  )

  density_hits <- vector("list", length(saved_files) * 2L)
  heatmap_panels <- list()
  heatmap_signal_flags <- logical(length(saved_files))
  sample_metadata <- rnameta_build_sample_metadata(saved_files)
  interval_count <- 0L

  for (index in seq_along(saved_files)) {
    file_info <- saved_files[[index]]
    sample_name <- sample_metadata[[index]]$display_name
    original_name <- sample_metadata[[index]]$original_name

    transcription_progress_update(
      progress,
      40 + floor(index / length(saved_files) * 42),
      sprintf("Collecting transcription boundary hits for %s (%d/%d)", basename(file_info$file_name), index, length(saved_files))
    )

    raw_peaks <- peak_distribution_read_peaks(file_info$file_path, annotation_bundle$txdb, sample_name = sample_name)
    interval_count <- interval_count + length(raw_peaks)

    density_hits[[index * 2 - 1]] <- site_profile_collect_boundary_hits(
      query_ranges = raw_peaks,
      windows = windows$coverage_tss,
      sample_name = sample_name,
      feature_label = "Transcription_start_site",
      rel_offset = windows$rel_offset,
      x_min = -controls$flank_size,
      x_max = controls$flank_size - 1,
      flank_size = controls$flank_size
    )
    density_hits[[index * 2]] <- site_profile_collect_boundary_hits(
      query_ranges = raw_peaks,
      windows = windows$coverage_tes,
      sample_name = sample_name,
      feature_label = "Transcription_end_site",
      rel_offset = windows$rel_offset,
      x_min = -controls$flank_size,
      x_max = controls$flank_size - 1,
      flank_size = controls$flank_size
    )

    transcription_progress_update(
      progress,
      84 + floor(index / length(saved_files) * 12),
      sprintf("Preparing heatmaps for %s (%d/%d)", basename(file_info$file_name), index, length(saved_files))
    )
    heatmap_result <- transcription_build_heatmap_panels(
      source_file = file_info$file_path,
      species_key = species_key,
      peaks = raw_peaks,
      windows = windows,
      sample_name = sample_name,
      original_name = original_name
    )
    heatmap_panels <- c(heatmap_panels, heatmap_result$panels)
    heatmap_signal_flags[[index]] <- isTRUE(heatmap_result$has_signal)
  }

  density_hits <- data.table::rbindlist(density_hits, use.names = TRUE, fill = TRUE)
  has_signal <- transcription_has_boundary_signal(density_hits)
  has_heatmap_signal <- any(heatmap_signal_flags)
  density_data <- site_profile_density_points(
    hit_table = density_hits,
    x_min = -controls$flank_size,
    x_max = controls$flank_size - 1,
    feature_order = names(transcription_panel_titles())
  )

  transcription_progress_update(progress, 100, "Building chart payload and finalizing results")

  list(
    chart_payload = if (has_signal || has_heatmap_signal) transcription_build_chart_payload(density_data, heatmap_panels, sample_metadata, windows$x_domain) else NULL,
    density_hits = density_hits,
    density_data = density_data,
    heatmap_panels = heatmap_panels,
    sample_metadata = sample_metadata,
    species = upload_context$species,
    sample_count = length(saved_files),
    interval_count = interval_count,
    heatmap_sample = if (has_signal && has_heatmap_signal && length(heatmap_panels)) heatmap_panels[[1]]$sampleName else NA_character_,
    has_signal = has_signal,
    has_heatmap_signal = has_heatmap_signal,
    boundary_hit_count = nrow(density_hits),
    empty_state_message = if (has_signal) NULL else transcription_empty_state_message(),
    heatmap_notice_message = if (has_signal && !has_heatmap_signal) transcription_heatmap_empty_message() else NULL
  )
}
