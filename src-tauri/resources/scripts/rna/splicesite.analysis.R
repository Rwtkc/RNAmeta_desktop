run_splicesite_analysis <- function(upload_context, controls = splicesite_default_controls(), annotation_dir, progress = NULL) {
  saved_files <- site_profile_require_saved_upload(upload_context, "Splicesite")
  controls <- utils::modifyList(splicesite_default_controls(), controls)
  species_key <- if (!is.null(upload_context$species_id) && nzchar(upload_context$species_id)) upload_context$species_id else upload_context$species

  splicesite_progress_update(progress, 12, "Loading saved BED files and species annotation bundle")
  annotation_bundle <- site_profile_load_annotation_bundle(
    annotation_dir = annotation_dir,
    species = upload_context$species,
    species_id = upload_context$species_id
  )
  splicesite_progress_update(progress, 26, "Preparing cached splice-site boundary windows")
  txdb_features <- site_profile_load_txdb_features(
    annotation_dir = annotation_dir,
    species = upload_context$species,
    species_id = upload_context$species_id,
    minimal_component_length = 100
  )
  windows <- site_profile_prepare_splicesite_windows(
    species_key = species_key,
    exons_by_tx = txdb_features$exons,
    flank_size = controls$flank_size
  )

  density_hits <- vector("list", length(saved_files) * 2L)
  sample_metadata <- rnameta_build_sample_metadata(saved_files)
  interval_count <- 0L

  for (index in seq_along(saved_files)) {
    file_info <- saved_files[[index]]
    sample_name <- sample_metadata[[index]]$display_name

    splicesite_progress_update(
      progress,
      40 + floor(index / length(saved_files) * 42),
      sprintf("Collecting splice-site hits for %s (%d/%d)", basename(file_info$file_name), index, length(saved_files))
    )

    raw_peaks <- peak_distribution_read_peaks(file_info$file_path, annotation_bundle$txdb, sample_name = sample_name)
    interval_count <- interval_count + length(raw_peaks)

    density_hits[[index * 2 - 1]] <- site_profile_collect_boundary_hits(
      query_ranges = raw_peaks,
      windows = windows$windows_5p,
      sample_name = sample_name,
      feature_label = "5PSS",
      rel_offset = windows$offset_5p,
      x_min = -controls$flank_size,
      x_max = controls$flank_size * 2,
      flank_size = controls$flank_size
    )
    density_hits[[index * 2]] <- site_profile_collect_boundary_hits(
      query_ranges = raw_peaks,
      windows = windows$windows_3p,
      sample_name = sample_name,
      feature_label = "3PSS",
      rel_offset = windows$offset_3p,
      x_min = -controls$flank_size * 2,
      x_max = controls$flank_size,
      flank_size = controls$flank_size
    )
  }

  density_hits <- data.table::rbindlist(density_hits, use.names = TRUE, fill = TRUE)
  density_data_5p <- site_profile_density_points(
    hit_table = density_hits[feature == "5PSS"],
    x_min = -controls$flank_size,
    x_max = controls$flank_size * 2,
    feature_order = "5PSS"
  )
  density_data_3p <- site_profile_density_points(
    hit_table = density_hits[feature == "3PSS"],
    x_min = -controls$flank_size * 2,
    x_max = controls$flank_size,
    feature_order = "3PSS"
  )
  density_data <- data.table::rbindlist(list(density_data_5p, density_data_3p), use.names = TRUE, fill = TRUE)

  splicesite_progress_update(progress, 100, "Building chart payload and finalizing results")

  list(
    chart_payload = splicesite_build_chart_payload(density_data, sample_metadata, controls$flank_size),
    density_hits = density_hits,
    density_data = density_data,
    sample_metadata = sample_metadata,
    species = upload_context$species,
    sample_count = length(saved_files),
    interval_count = interval_count,
    junction_hit_count = nrow(density_hits)
  )
}
