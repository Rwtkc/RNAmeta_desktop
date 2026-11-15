.generate_pos_para <- function(peak) {
  list(
    fig_top = 1.05 * peak,
    fig_bottom = -0.6,
    rna_comp_text = -0.06 * peak,
    rna_lgd_bl = -0.03 * peak,
    rna_lgd_h_cds = 0.01 * peak,
    rna_lgd_h_ncrna = 0.01 * peak,
    rna_lgd_h_rna = 0.01 * peak,
    rna_lgd_h_utr = 0.005 * peak,
    rna_lgd_h_flank = 0.002 * peak
  )
}

meta_plot_generate_density_ci <- function(relative_points, point_weight, adjust, enableCI, CI_ResamplingTime = 1000, CI_interval = c(0.025, 0.975)) {
  density_dataframe <- data.frame()
  for (group_name in names(relative_points)) {
    valid <- is.finite(point_weight[[group_name]]) & point_weight[[group_name]] > 0 & is.finite(relative_points[[group_name]])
    point_weight[[group_name]] <- point_weight[[group_name]][valid]
    relative_points[[group_name]] <- relative_points[[group_name]][valid]
    if (length(relative_points[[group_name]]) < 2L) next
    site_weight <- point_weight[[group_name]] / sum(point_weight[[group_name]])
    site_id <- relative_points[[group_name]]
    fit <- suppressWarnings(stats::density(site_id, adjust = adjust, from = 0, to = 1, n = 256, weight = site_weight))
    tmp <- data.frame(x = fit$x, density = fit$y / (sum(diff(fit$x) * (head(fit$y, -1) + tail(fit$y, -1))) / 2), group = rep(group_name, length(fit$y)))
    if (enableCI) {
      point_index <- seq_along(site_id)
      names(point_index) <- names(site_id)
      point_grouped <- split(point_index, names(point_index))
      fit_resampled <- replicate(CI_ResamplingTime, {
        resampled_groups <- sample(names(point_grouped), replace = TRUE)
        resampled_index <- unlist(point_grouped[resampled_groups])
        suppressWarnings(stats::density(site_id[resampled_index], adjust = adjust, from = 0, to = 1, n = 256, weight = site_weight[resampled_index])$y)
      })
      fit_quantile <- apply(fit_resampled, 1, stats::quantile, CI_interval)
      tmp$confidenceDown <- fit_quantile[1, ]
      tmp$confidenceUp <- fit_quantile[2, ]
    }
    density_dataframe <- rbind(density_dataframe, tmp)
  }
  density_dataframe
}

meta_plot_rna_plot_structure <- function(plot, component_width, controls, pos) {
  component_structure <- data.frame(width = component_width, comp = names(component_width), label = names(component_width))
  component_structure <- component_structure[component_structure$width > 0, , drop = FALSE]

  if (!nrow(component_structure)) {
    return(plot)
  }

  component_structure$end <- cumsum(component_structure$width)
  component_structure$start <- c(0, head(component_structure$end, -1)) + 0.001
  component_structure$mid <- (component_structure$start + component_structure$end) / 2
  component_structure$label[component_structure$comp == "promoter"] <- if (identical(controls$headOrtail, "TRUE")) sprintf("Promoter(%skb)", controls$txpromoterLength / 1000) else NA
  component_structure$label[component_structure$comp == "tail"] <- if (identical(controls$headOrtail, "TRUE")) sprintf("Tail(%skb)", controls$txtailLength / 1000) else NA
  component_structure$label[component_structure$comp == "utr5"] <- "5'UTR"
  component_structure$label[component_structure$comp == "utr3"] <- "3'UTR"
  component_structure$label[component_structure$comp == "cds"] <- "CDS"
  component_structure$label[component_structure$comp == "ncrna"] <- "ncRNA"
  component_structure$label[component_structure$comp == "rna"] <- "RNA"
  component_structure$alpha <- ifelse(component_structure$comp %in% c("cds", "ncrna", "rna"), c(cds = 0.272, ncrna = 0.2, rna = 0.2)[component_structure$comp], 0.99)
  component_structure$lgd_height <- ifelse(component_structure$comp == "cds", pos$rna_lgd_h_cds, ifelse(component_structure$comp %in% c("ncrna", "rna"), pos$rna_lgd_h_ncrna, ifelse(component_structure$comp %in% c("utr5", "utr3"), pos$rna_lgd_h_utr, pos$rna_lgd_h_flank)))
  for (i in seq_len(nrow(component_structure))) {
    plot <- plot + ggplot2::annotate("text", x = component_structure$mid[i], y = pos$rna_comp_text - 0.035, label = component_structure$label[i])
    plot <- plot + ggplot2::annotate("rect", xmin = component_structure$start[i], xmax = component_structure$end[i], ymin = pos$rna_lgd_bl - component_structure$lgd_height[i], ymax = pos$rna_lgd_bl + component_structure$lgd_height[i], alpha = component_structure$alpha[i], colour = "black")
  }
  if (nrow(component_structure) > 1) {
    separator <- data.frame(x = head(component_structure$end, -1), y1 = rep(pos$fig_top, nrow(component_structure) - 1), y2 = rep(pos$rna_lgd_bl, nrow(component_structure) - 1))
    plot <- plot + ggplot2::geom_segment(ggplot2::aes(x = x, y = y1, xend = x, yend = y2), linetype = "dotted", linewidth = 0.5, data = separator)
  }
  plot
}

meta_plot_plot_density_ci <- function(density_ci, component_width, controls) {
  peak <- if (identical(controls$enableCI, "TRUE")) max(density_ci$confidenceUp) else max(density_ci$density)
  pos <- .generate_pos_para(peak)
  samples <- factor(density_ci$group)
  title <- c(tx = "Distribution on exon", mrna = "Distribution on mRNA", ncrna = "Distribution on lncRNA")[[controls$pltTxType]]
  plot <- ggplot2::ggplot(density_ci, ggplot2::aes(x = x)) +
    ggplot2::geom_line(ggplot2::aes(y = density, colour = samples), alpha = 1, linewidth = 1) +
    ggplot2::geom_ribbon(ggplot2::aes(ymin = 0, ymax = density, colour = samples, fill = samples), alpha = 0.2)
  if (identical(controls$enableCI, "TRUE")) {
    plot <- plot +
      ggplot2::geom_line(ggplot2::aes(y = confidenceDown, colour = samples), colour = "blue", alpha = 0.4, linewidth = 0.5) +
      ggplot2::geom_line(ggplot2::aes(y = confidenceUp, colour = samples), colour = "black", alpha = 0.4, linewidth = 0.5) +
      ggplot2::geom_ribbon(ggplot2::aes(ymin = confidenceDown, ymax = confidenceUp, colour = samples, fill = samples), alpha = 0.2, colour = NA)
  }
  plot <- plot + ggplot2::labs(title = title, y = "Frequency") + ggplot2::theme(plot.title = ggplot2::element_text(face = "bold", margin = ggplot2::margin(10, 0, 10, 0), size = 14), axis.ticks = ggplot2::element_blank(), axis.text.x = ggplot2::element_blank(), axis.title.x = ggplot2::element_blank(), axis.title.y = ggplot2::element_text(vjust = 2, size = 14, face = "bold"), panel.grid = ggplot2::element_blank(), axis.text.y = ggplot2::element_text(size = 13), panel.grid.minor = ggplot2::element_blank(), panel.grid.major = ggplot2::element_line(color = "white", linewidth = 0.7), panel.border = ggplot2::element_rect(colour = "#4c4c4c", fill = NA, linewidth = 0.8), legend.position = "bottom", legend.text = ggplot2::element_text(size = 13), legend.title = ggplot2::element_blank()) + ggplot2::scale_y_continuous(limits = c(pos$fig_bottom, pos$fig_top), expand = c(0, 0))
  meta_plot_rna_plot_structure(plot, component_width, controls, pos)
}
