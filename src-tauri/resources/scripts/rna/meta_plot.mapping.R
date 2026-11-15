meta_plot_get_site_group <- function(stBedFiles, stGroupName = NULL) {
  site_group <- lapply(stBedFiles, function(path) rtracklayer::blocks(rtracklayer::import(path)))
  names(site_group) <- if (is.null(stGroupName)) paste0("Group", seq_along(site_group)) else stGroupName
  site_group
}

meta_plot_granges_list_map_to_transcripts <- function(site, map_filter_transcript = FALSE, transcripts) {
  names(site) <- seq_along(site)
  x_widths <- sum(IRanges::width(site))
  names(x_widths) <- names(site)
  tx_coord <- GenomicFeatures::mapToTranscripts(unlist(site), transcripts, ignore.strand = FALSE)
  grouped <- split(tx_coord, paste(names(tx_coord), tx_coord$transcriptsHits, sep = "-"))
  reduced_grouped <- GenomicRanges::reduce(grouped)
  mapping_filtered <- unlist(reduced_grouped[S4Vectors::elementNROWS(reduced_grouped) == 1L], use.names = TRUE)
  x_hit_tx_hit <- strsplit(names(mapping_filtered), "-", fixed = TRUE)
  S4Vectors::mcols(mapping_filtered) <- S4Vectors::DataFrame(
    xHits = as.numeric(vapply(x_hit_tx_hit, `[`, character(1), 1)),
    txHits = as.numeric(vapply(x_hit_tx_hit, `[`, character(1), 2))
  )
  if (map_filter_transcript) {
    mapping_filtered <- mapping_filtered[IRanges::width(mapping_filtered) == x_widths[mapping_filtered$xHits]]
  }
  out_of_bound <- GenomicRanges:::get_out_of_bound_index(mapping_filtered)
  if (length(out_of_bound) > 0) {
    mapping_filtered <- mapping_filtered[-out_of_bound]
  }
  mapping_filtered
}

meta_plot_build_sample_point_ranges <- function(mapped, controls) {
  st_sample_num <- 2 * controls$stSampleNum - 1
  site_width <- IRanges::width(mapped)
  sample_fn <- if (identical(controls$stSampleModle, "random")) {
    function(x, i) if (i == 1) round(x / 2) else sort(sample(x, i, replace = FALSE))
  } else {
    function(x, i) if (i == 1) round(x / 2) else round(seq(1, x - 1, length.out = i))
  }
  site_points <- t(vapply(site_width, sample_fn, i = st_sample_num, numeric(st_sample_num)))
  site_point_vector <- as.numeric(t(site_points))
  point_ranges <- GenomicRanges::makeGRangesFromDataFrame(
    data.frame(
      chr = rep(as.character(GenomicRanges::seqnames(mapped)), each = st_sample_num),
      start = site_point_vector + start(rep(mapped, each = st_sample_num)) - 1,
      end = site_point_vector + start(rep(mapped, each = st_sample_num))
    )
  )
  overlap_count <- ave(seq_along(mapped), mapped$xHits, FUN = length)
  S4Vectors::mcols(point_ranges) <- S4Vectors::DataFrame(
    sitesLength = rep(site_width, each = st_sample_num),
    xHits = rep(mapped$xHits, each = st_sample_num),
    pointsOverlapTx = rep(overlap_count, each = st_sample_num)
  )
  point_ranges
}

meta_plot_sample_points <- function(site_group, controls, guitar_txdb, source_file = NULL, extract_key = NULL) {
  tx_type <- controls$pltTxType
  mapped <- if (!is.null(source_file) && !is.null(extract_key)) {
    meta_plot_cached_mapped_transcripts(
      source_file = source_file,
      controls = controls,
      extract_key = extract_key,
      mapper = function() {
        meta_plot_granges_list_map_to_transcripts(
          site_group[[1]],
          identical(controls$mapFilterTranscript, "TRUE"),
          guitar_txdb[[tx_type]]$tx
        )
      }
    )
  } else {
    meta_plot_granges_list_map_to_transcripts(
      site_group[[1]],
      identical(controls$mapFilterTranscript, "TRUE"),
      guitar_txdb[[tx_type]]$tx
    )
  }
  point_ranges <- meta_plot_build_sample_point_ranges(mapped, controls)
  list(mapped = mapped, points = point_ranges)
}

meta_plot_normalize <- function(points, guitar_txdb, controls) {
  if (!length(points)) return(list(position = numeric(), weight = numeric()))
  tx_type <- controls$pltTxType
  points_pos_tx <- end(points)
  names(points_pos_tx) <- as.character(GenomicRanges::seqnames(points))
  start_point_mat <- guitar_txdb[[tx_type]]$startPoint[names(points_pos_tx), , drop = FALSE]
  start_point_differ <- start_point_mat - points_pos_tx
  point_component <- apply(start_point_differ, 1, function(x) max(which(x < 0)))
  point_position_component <- -start_point_differ[cbind(seq_along(point_component), point_component)]
  component_width_avg <- guitar_txdb[[tx_type]]$componentWidthAverage_pct[point_component]
  component_start_pct <- guitar_txdb[[tx_type]]$componentStartAverage_pct[point_component]
  component_width_mat <- guitar_txdb[[tx_type]]$componentWidth[names(points_pos_tx), , drop = FALSE]
  point_component_width <- component_width_mat[cbind(seq_along(point_component), point_component)]
  point_position_normalized <- point_position_component / point_component_width * component_width_avg + component_start_pct
  names(point_position_normalized) <- points$xHits
  component_pct <- guitar_txdb[[tx_type]]$componentWidthPtc[names(point_component), , drop = FALSE]
  point_component_pct <- unlist(lapply(seq_along(point_component), function(i) component_pct[i, ][point_component[[i]]]))
  point_weight <- component_width_avg / (points$pointsOverlapTx ^ controls$overlapIndex) / point_component_pct * (points$sitesLength ^ controls$siteLengthIndex)
  names(point_weight) <- points$xHits
  list(position = point_position_normalized, weight = point_weight)
}
