translation_build_chart_payload <- function(density_data, heatmap_panels, sample_metadata, x_domain = c(-100, 100)) {
  density_titles <- translation_panel_titles()
  heatmap_samples <- lapply(sample_metadata, function(sample) {
    list(
      value = sample$display_name,
      label = sample$display_name
    )
  })
  density_panels <- lapply(names(density_titles), function(panel_key) {
    site_profile_density_panel(
      panel_title = density_titles[[panel_key]],
      panel_key = panel_key,
      density_data = density_data,
      sample_metadata = sample_metadata,
      x_domain = x_domain,
      x_label = "Region around the site (0 and 5' -> 3' direction)",
      y_label = "Density"
    )
  })

  list(
    title = "Translation",
    hideTitle = TRUE,
    layout = "stacked",
    panels = c(density_panels, heatmap_panels),
    heatmapSamples = heatmap_samples,
    defaultHeatmapSample = if (length(heatmap_samples)) heatmap_samples[[1]]$value else NULL,
    legend = site_profile_legend_entries(sample_metadata)
  )
}

translation_data_export_table <- function(result) {
  density_export <- site_profile_density_export_table(
    density_data = result$density_data,
    sample_metadata = result$sample_metadata,
    module_name = "Translation"
  )
  heatmap_export <- site_profile_heatmap_export_table(
    heatmap_panels = result$heatmap_panels,
    module_name = "Translation"
  )

  if (!nrow(heatmap_export)) {
    return(density_export)
  }

  density_export$Rows <- NA_integer_
  density_export$Columns <- NA_integer_
  density_export$X_Min <- NA_real_
  density_export$X_Max <- NA_real_
  heatmap_export$Position <- NA_real_
  heatmap_export$Density <- NA_real_

  rbind(
    density_export[, c("Module", "Panel", "Sample", "Source_File", "Position", "Density", "Rows", "Columns", "X_Min", "X_Max")],
    heatmap_export[, c("Module", "Panel", "Sample", "Source_File", "Position", "Density", "Rows", "Columns", "X_Min", "X_Max")]
  )
}
