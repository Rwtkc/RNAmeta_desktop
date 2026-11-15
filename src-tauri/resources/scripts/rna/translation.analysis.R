translation_build_heatmap_panels <- function(source_file, species_key, transcript_heatmap_peaks, windows, sample_name, original_name) {
  sampled_tss <- site_profile_evenly_sample_windows(windows$tss_windows, sample_n = 4000)
  sampled_tes <- site_profile_evenly_sample_windows(windows$tes_windows, sample_n = 4000)
  tss_display_options <- list(
    rowHeightPx = 6.5,
    signalDefinition = "BED interval centres mapped to transcript coordinates (1 nt)",
    widthRatio = 0.84,
    cornerRadiusPx = 0,
    displayRowTarget = 192,
    renderScale = 8,
    showGrid = FALSE,
    pixelated = FALSE,
    backgroundColor = "#fffaf2",
    palette = c("#fff0d9", "#f7cf7a", "#ee9b4b", "#da6a33", "#b23a2c", "#7f1d1d"),
    gridOuterStroke = "rgba(120, 101, 78, 0.24)",
    gridOuterStrokeWidth = 0.12,
    horizontalGridStroke = "rgba(120, 101, 78, 0.07)",
    verticalGridStroke = "rgba(120, 101, 78, 0.035)",
    gridStrokeWidth = 0.06
  )
  tes_display_options <- utils::modifyList(tss_display_options, list(displayRowTarget = 96))
  heatmap_cache_token <- site_profile_runtime_cache_key(
    "tss_rows", tss_display_options$displayRowTarget,
    "tes_rows", tes_display_options$displayRowTarget,
    "render_scale", tss_display_options$renderScale,
    "row_height", tss_display_options$rowHeightPx,
    "width_ratio", tss_display_options$widthRatio
  )

  site_profile_cached_heatmap_panels("translation-centered-v2", source_file, species_key, windows$flank_size, function() {
    tss_matrix <- site_profile_score_matrix_rna(transcript_heatmap_peaks, sampled_tss)
    tes_matrix <- site_profile_score_matrix_rna(transcript_heatmap_peaks, sampled_tes)

    list(
      site_profile_heatmap_panel(
        title = site_profile_heatmap_title_with_source("Translation.Tss.Heatmap", original_name),
        tag_matrix = tss_matrix,
        x_positions = windows$x_positions,
        sample_name = sample_name,
        original_name = original_name,
        display_options = tss_display_options
      ),
      site_profile_heatmap_panel(
        title = site_profile_heatmap_title_with_source("Translation.Tes.Heatmap", original_name),
        tag_matrix = tes_matrix,
        x_positions = windows$x_positions,
        sample_name = sample_name,
        original_name = original_name,
        display_options = tes_display_options
      )
    )
  }, cache_token = heatmap_cache_token)
}

run_translation_analysis <- function(upload_context, controls = translation_default_controls(), annotation_dir, progress = NULL) {
  saved_files <- site_profile_require_saved_upload(upload_context, "Translation")
  controls <- utils::modifyList(translation_default_controls(), controls)
  species_key <- if (!is.null(upload_context$species_id) && nzchar(upload_context$species_id)) upload_context$species_id else upload_context$species

  translation_progress_update(progress, 12, "Loading saved BED files and species annotation bundle")
  annotation_bundle <- site_profile_load_annotation_bundle(
    annotation_dir = annotation_dir,
    species = upload_context$species,
    species_id = upload_context$species_id
  )
  translation_progress_update(progress, 28, "Preparing cached translation boundary windows")
  txdb_features <- site_profile_load_txdb_features(
    annotation_dir = annotation_dir,
    species = upload_context$species,
    species_id = upload_context$species_id,
    minimal_component_length = 100
  )
  windows <- site_profile_prepare_translation_windows(
    species_key = species_key,
    txlens = annotation_bundle$txlens,
    exons = txdb_features$exons,
    flank_size = controls$flank_size
  )

  density_hits <- vector("list", length(saved_files) * 2L)
  heatmap_panels <- list()
  sample_metadata <- rnameta_build_sample_metadata(saved_files)
  interval_count <- 0L

  for (index in seq_along(saved_files)) {
    file_info <- saved_files[[index]]
    sample_name <- sample_metadata[[index]]$display_name
    original_name <- sample_metadata[[index]]$original_name

    translation_progress_update(
      progress,
      42 + floor(index / length(saved_files) * 38),
      sprintf("Mapping transcript-space peaks for %s (%d/%d)", basename(file_info$file_name), index, length(saved_files))
    )

    raw_peaks <- peak_distribution_read_peaks(file_info$file_path, annotation_bundle$txdb, sample_name = sample_name)
    transcript_peaks <- site_profile_map_to_transcript_space(
      source_file = file_info$file_path,
      species_key = species_key,
      peaks = raw_peaks,
      exons = txdb_features$exons,
      cache_tag = "translation-density"
    )
    interval_count <- interval_count + length(raw_peaks)

    density_hits[[index * 2 - 1]] <- site_profile_collect_boundary_hits(
      query_ranges = transcript_peaks,
      windows = windows$tss_windows,
      sample_name = sample_name,
      feature_label = "Translation_start_site",
      rel_offset = windows$rel_offset,
      x_min = windows$x_domain[[1]],
      x_max = windows$x_domain[[2]],
      flank_size = controls$flank_size
    )
    density_hits[[index * 2]] <- site_profile_collect_boundary_hits(
      query_ranges = transcript_peaks,
      windows = windows$tes_windows,
      sample_name = sample_name,
      feature_label = "Translation_end_site",
      rel_offset = windows$rel_offset,
      x_min = windows$x_domain[[1]],
      x_max = windows$x_domain[[2]],
      flank_size = controls$flank_size
    )

    translation_progress_update(
      progress,
      82 + floor(index / length(saved_files) * 14),
      sprintf("Preparing heatmaps for %s (%d/%d)", basename(file_info$file_name), index, length(saved_files))
    )
    transcript_heatmap_peaks <- site_profile_map_to_transcript_space(
      source_file = file_info$file_path,
      species_key = species_key,
      peaks = site_profile_center_peaks(raw_peaks),
      exons = txdb_features$exons,
      cache_tag = "translation-heatmap"
    )
    heatmap_panels <- c(
      heatmap_panels,
      translation_build_heatmap_panels(
        source_file = file_info$file_path,
        species_key = species_key,
        transcript_heatmap_peaks = transcript_heatmap_peaks,
        windows = windows,
        sample_name = sample_name,
        original_name = original_name
      )
    )
  }

  density_hits <- data.table::rbindlist(density_hits, use.names = TRUE, fill = TRUE)
  density_data <- site_profile_density_points(
    hit_table = density_hits,
    x_min = windows$x_domain[[1]],
    x_max = windows$x_domain[[2]],
    feature_order = names(translation_panel_titles())
  )

  translation_progress_update(progress, 100, "Building chart payload and finalizing results")

  list(
    chart_payload = translation_build_chart_payload(density_data, heatmap_panels, sample_metadata, windows$x_domain),
    density_hits = density_hits,
    density_data = density_data,
    heatmap_panels = heatmap_panels,
    sample_metadata = sample_metadata,
    species = upload_context$species,
    sample_count = length(saved_files),
    interval_count = interval_count,
    heatmap_sample = if (length(heatmap_panels)) heatmap_panels[[1]]$sampleName else NA_character_,
    boundary_hit_count = nrow(density_hits)
  )
}
