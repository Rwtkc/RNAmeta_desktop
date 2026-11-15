meta_plot_effective_controls <- function(controls) {
  effective_controls <- controls
  if (!identical(effective_controls$headOrtail, "TRUE")) {
    effective_controls$txpromoterLength <- 0L
    effective_controls$txtailLength <- 0L
  }
  effective_controls
}

run_meta_plot_analysis <- function(upload_context, controls, annotation_dir, progress = NULL) {
  meta_plot_progress_update(progress, 10, "Loading saved BED files and annotation bundle")
  upload_context <- meta_plot_require_upload(upload_context)
  saved_files <- upload_context$saved_files
  effective_controls <- meta_plot_effective_controls(controls)
  species_cache_key <- if (!is.null(upload_context$species_id) && nzchar(upload_context$species_id)) {
    upload_context$species_id
  } else {
    upload_context$species
  }
  cache_key <- paste(normalizePath(annotation_dir, winslash = "/"), species_cache_key, sep = "::")

  bundle <- load_meta_plot_annotation_bundle(
    annotation_dir,
    upload_context$species,
    species_id = upload_context$species_id,
    cache_key = cache_key
  )
  annotation_features <- meta_plot_cached_annotation_features(
    species = cache_key,
    builder = function() meta_plot_build_annotation_features(bundle$txdb)
  )
  prepared_beds <- lapply(saved_files, function(file_info) meta_plot_prepare_bed_file(file_info$file_path, bundle$txdb))
  series_metadata <- meta_plot_build_series_metadata(saved_files)
  group_names <- vapply(series_metadata, function(entry) entry$display_name, character(1))
  extract_key <- meta_plot_extract_controls_key(cache_key, effective_controls)

  meta_plot_progress_update(progress, 25, "Constructing transcript-relative annotation structure")
  guitar_txdb <- meta_plot_cached_guitar_txdb(
    species = cache_key,
    controls = effective_controls,
    builder = function() meta_plot_make_guitar_txdb(bundle$txdb, effective_controls, annotation_features = annotation_features)
  )
  tx_type <- controls$pltTxType
  if (!(tx_type %in% guitar_txdb$txTypes)) {
    stop(sprintf("Transcript type '%s' is not available for the current annotation bundle.", tx_type))
  }
  sites_group <- meta_plot_get_site_group(stBedFiles = prepared_beds, stGroupName = group_names)

  meta_plot_progress_update(progress, 45, "Sampling genomic positions across transcript structure")
  relative_points <- vector("list", length(saved_files))
  point_weight <- vector("list", length(saved_files))
  interval_count <- 0L
  sampled_point_count <- 0L
  overlap_count <- 0L

  for (index in seq_along(saved_files)) {
    file_info <- saved_files[[index]]
    sampled <- meta_plot_cached_sample_points(
      source_file = file_info$file_path,
      controls = effective_controls,
      extract_key = extract_key,
      sampler = function() {
        meta_plot_sample_points(
          site_group = sites_group[index],
          controls = effective_controls,
          guitar_txdb = guitar_txdb,
          source_file = file_info$file_path,
          extract_key = extract_key
        )
      }
    )

    meta_plot_progress_update(
      progress,
      45 + floor(index / length(saved_files) * 20),
      sprintf("Normalizing transcript-relative coordinates for %s (%d/%d)", basename(file_info$file_name), index, length(saved_files))
    )

    normalized <- meta_plot_normalize(sampled$points, guitar_txdb, effective_controls)
    relative_points[[index]] <- normalized$position
    point_weight[[index]] <- normalized$weight
    interval_count <- interval_count + length(unlist(sites_group[[index]]))
    sampled_point_count <- sampled_point_count + length(normalized$position)
    overlap_count <- overlap_count + length(unique(sampled$points$xHits))
  }
  names(relative_points) <- group_names
  names(point_weight) <- group_names

  meta_plot_progress_update(progress, 85, "Estimating density curves and confidence intervals")
  density_ci <- meta_plot_generate_density_ci(
    relative_points,
    point_weight,
    adjust = effective_controls$adjust,
    enableCI = identical(effective_controls$enableCI, "TRUE")
  )
  if (!nrow(density_ci)) {
    return(list(chart_payload = NULL, density_data = density_ci, has_signal = FALSE,
      species = upload_context$species, sample_count = length(saved_files),
      interval_count = interval_count, sampled_point_count = sampled_point_count,
      overlap_count = overlap_count,
      reason = "Fewer than two valid sampled positions for density estimation"))
  }

  meta_plot_progress_update(progress, 100, "Building chart payload and finalizing plot output")
  list(
    density_data = density_ci,
    chart_payload = meta_plot_build_chart_payload(
      density_ci = density_ci,
      component_width = guitar_txdb[[tx_type]]$componentWidthAverage_pct,
      controls = effective_controls,
      series_metadata = series_metadata
    ),
    species = upload_context$species,
    sample_count = length(saved_files),
    interval_count = interval_count,
    sampled_point_count = sampled_point_count,
    overlap_count = overlap_count
  )
}
