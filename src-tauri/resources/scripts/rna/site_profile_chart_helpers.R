site_profile_group_palette <- function() {
  c("#de7a61", "#3f3f5b", "#81b29d", "#d69779", "#b7c88b")
}

site_profile_density_points <- function(hit_table, x_min, x_max, feature_order = NULL, point_count = 512) {
  if (is.null(hit_table) || !nrow(hit_table)) {
    return(data.table::data.table(
      Panel = character(),
      Sample = character(),
      Position = numeric(),
      Density = numeric()
    ))
  }

  density_rows <- lapply(split(hit_table, by = c("feature", "Sample"), keep.by = TRUE), function(sample_hits) {
    density_values <- sample_hits$rel_pos[is.finite(sample_hits$rel_pos)]
    if (!length(density_values)) {
      density_values <- c(0, 0)
    } else if (length(density_values) < 2) {
      density_values <- rep(density_values[[1]], 2)
    }

    density_curve <- stats::density(
      density_values,
      from = x_min,
      to = x_max,
      n = point_count,
      bw = if (length(unique(density_values)) < 2) 1 else "nrd0",
      na.rm = TRUE
    )

    data.table::data.table(
      Panel = unique(as.character(sample_hits$feature))[[1]],
      Sample = unique(as.character(sample_hits$Sample))[[1]],
      Position = as.numeric(density_curve$x),
      Density = as.numeric(density_curve$y)
    )
  })

  density_data <- data.table::rbindlist(density_rows, use.names = TRUE, fill = TRUE)

  if (!is.null(feature_order) && length(feature_order)) {
    density_data[, Panel := factor(Panel, levels = feature_order)]
    data.table::setorder(density_data, Panel, Sample, Position)
    density_data[, Panel := as.character(Panel)]
  }

  density_data
}

site_profile_density_panel <- function(panel_title, panel_key, density_data, sample_metadata, x_domain, x_label, y_label) {
  panel_data <- density_data[Panel == panel_key]
  samples <- unique(as.character(panel_data$Sample))
  palette <- site_profile_group_palette()
  max_density <- max(panel_data$Density, na.rm = TRUE)
  if (!is.finite(max_density) || max_density <= 0) {
    max_density <- 1
  }

  list(
    type = "density",
    key = panel_key,
    title = panel_title,
    xLabel = x_label,
    yLabel = y_label,
    xDomain = x_domain,
    yDomain = c(0, max_density * 1.08),
    yTicks = scales::pretty_breaks(n = 5)(c(0, max_density * 1.08)),
    guideLines = list(0),
    series = lapply(seq_along(samples), function(index) {
      sample_name <- samples[[index]]
      original_name <- rnameta_lookup_original_name(sample_metadata, sample_name, fallback = sample_name)
      sample_points <- panel_data[Sample == sample_name]

      list(
        name = sample_name,
        originalName = original_name,
        color = palette[((index - 1) %% length(palette)) + 1],
        values = lapply(seq_len(nrow(sample_points)), function(point_index) {
          list(
            x = as.numeric(sample_points$Position[[point_index]]),
            density = as.numeric(sample_points$Density[[point_index]])
          )
        })
      )
    })
  )
}

site_profile_legend_entries <- function(sample_metadata) {
  palette <- site_profile_group_palette()
  display_names <- rnameta_sample_display_names(sample_metadata)
  original_names <- rnameta_sample_original_names(sample_metadata)

  lapply(seq_along(display_names), function(index) {
    list(
      name = display_names[[index]],
      originalName = original_names[[index]],
      color = palette[((index - 1) %% length(palette)) + 1]
    )
  })
}

site_profile_density_export_table <- function(density_data, sample_metadata, module_name) {
  export_data <- data.table::copy(density_data)

  if (!nrow(export_data)) {
    return(data.frame(
      Module = character(),
      Panel = character(),
      Sample = character(),
      Source_File = character(),
      Position = numeric(),
      Density = numeric(),
      stringsAsFactors = FALSE
    ))
  }

  export_data[, Module := module_name]
  export_data[, Source_File := rnameta_lookup_original_name(sample_metadata, Sample, fallback = Sample), by = Sample]
  data.table::setcolorder(export_data, c("Module", "Panel", "Sample", "Source_File", "Position", "Density"))
  as.data.frame(export_data)
}

site_profile_heatmap_export_table <- function(heatmap_panels, module_name) {
  if (is.null(heatmap_panels) || !length(heatmap_panels)) {
    return(data.frame(
      Module = character(),
      Panel = character(),
      Sample = character(),
      Source_File = character(),
      Rows = integer(),
      Columns = integer(),
      X_Min = numeric(),
      X_Max = numeric(),
      stringsAsFactors = FALSE
    ))
  }

  do.call(
    rbind,
    lapply(heatmap_panels, function(panel) {
      data.frame(
        Module = module_name,
        Panel = panel$title,
        Sample = panel$sampleName,
        Source_File = panel$originalName,
        Rows = panel$rows,
        Columns = panel$columns,
        X_Min = panel$xDomain[[1]],
        X_Max = panel$xDomain[[2]],
        stringsAsFactors = FALSE
      )
    })
  )
}
