site_profile_prepare_heatmap_matrix <- function(tag_matrix) {
  if (is.null(tag_matrix)) return(matrix(numeric(), nrow = 0, ncol = 0))
  if (!nrow(tag_matrix)) return(tag_matrix)

  row_order <- order(rowSums(tag_matrix))
  tag_matrix <- tag_matrix[row_order, , drop = FALSE]
  non_zero_rows <- rowSums(tag_matrix) > 0

  tag_matrix <- tag_matrix[non_zero_rows, , drop = FALSE]

  tag_matrix
}

site_profile_reduce_heatmap_rows <- function(matrix_data, target_rows = NULL) {
  if (is.null(target_rows) || !is.finite(target_rows) || target_rows <= 0 || nrow(matrix_data) <= target_rows) {
    return(matrix_data)
  }

  break_points <- unique(floor(seq(0, nrow(matrix_data), length.out = target_rows + 1L)))
  break_points[[1]] <- 0L
  break_points[[length(break_points)]] <- nrow(matrix_data)

  reduced_rows <- lapply(seq_len(length(break_points) - 1L), function(index) {
    row_start <- break_points[[index]] + 1L
    row_end <- break_points[[index + 1L]]

    if (row_start > row_end) {
      return(NULL)
    }

    block <- matrix_data[row_start:row_end, , drop = FALSE]
    apply(block, 2, max, na.rm = TRUE)
  })

  reduced_rows <- Filter(Negate(is.null), reduced_rows)
  do.call(rbind, reduced_rows)
}

site_profile_expand_color_matrix <- function(color_matrix, scale_x = 1L, scale_y = 1L) {
  scale_x <- max(1L, as.integer(scale_x))
  scale_y <- max(1L, as.integer(scale_y))

  if (scale_x <= 1L && scale_y <= 1L) {
    return(color_matrix)
  }

  expanded_rows <- color_matrix[rep(seq_len(nrow(color_matrix)), each = scale_y), , drop = FALSE]
  expanded_rows[, rep(seq_len(ncol(expanded_rows)), each = scale_x), drop = FALSE]
}

site_profile_heatmap_data_uri <- function(tag_matrix, palette = c("#420046", "#fedc00"), target_rows = NULL, render_scale = 1L) {
  matrix_data <- site_profile_prepare_heatmap_matrix(tag_matrix)
  matrix_data <- site_profile_reduce_heatmap_rows(matrix_data, target_rows = target_rows)
  max_value <- if (length(matrix_data)) max(matrix_data) else 1

  if (!is.finite(max_value) || max_value <= 0) {
    max_value <- 1
  }

  scaled_values <- pmax(0, pmin(1, matrix_data / max_value))
  color_map <- grDevices::colorRampPalette(c("white", palette))(256)
  color_index <- pmax(1L, pmin(256L, floor(scaled_values * 255) + 1L))
  color_matrix <- matrix(color_map[color_index], nrow = nrow(matrix_data), ncol = ncol(matrix_data))
  # A blank PNG is only a transport fallback; the payload retains zero real rows.
  if (!nrow(color_matrix) || !ncol(color_matrix)) color_matrix <- matrix("white", 1, 1)
  color_matrix <- site_profile_expand_color_matrix(color_matrix, scale_x = render_scale, scale_y = render_scale)

  rgb_matrix <- grDevices::col2rgb(color_matrix, alpha = TRUE) / 255
  png_array <- array(0, dim = c(nrow(color_matrix), ncol(color_matrix), 4))
  png_array[, , 1] <- t(matrix(rgb_matrix[1, ], nrow = ncol(color_matrix), byrow = TRUE))
  png_array[, , 2] <- t(matrix(rgb_matrix[2, ], nrow = ncol(color_matrix), byrow = TRUE))
  png_array[, , 3] <- t(matrix(rgb_matrix[3, ], nrow = ncol(color_matrix), byrow = TRUE))
  png_array[, , 4] <- t(matrix(rgb_matrix[4, ], nrow = ncol(color_matrix), byrow = TRUE))

  temp_file <- tempfile(fileext = ".png")
  on.exit(unlink(temp_file, force = TRUE), add = TRUE)
  png::writePNG(png_array, target = temp_file)

  list(
    image_data = base64enc::dataURI(file = temp_file, mime = "image/png"),
    rows = nrow(matrix_data),
    columns = ncol(matrix_data),
    matrix_values = lapply(seq_len(nrow(matrix_data)), function(index) {
      round(as.numeric(matrix_data[index, ]), 4)
    })
  )
}

site_profile_heatmap_title_with_source <- function(title, source_name = NULL) {
  safe_title <- if (is.null(title)) "" else as.character(title)[[1]]
  safe_source <- if (is.null(source_name)) "" else basename(as.character(source_name)[[1]])

  if (!nzchar(safe_source)) {
    return(safe_title)
  }

  sprintf("%s(%s)", safe_title, safe_source)
}

site_profile_heatmap_panel <- function(title, tag_matrix, x_positions, sample_name, original_name, display_options = NULL) {
  if (is.null(tag_matrix) || (!nrow(tag_matrix) && !ncol(tag_matrix))) {
    tag_matrix <- matrix(numeric(), 0L, length(x_positions))
  }
  if (ncol(tag_matrix) != length(x_positions)) stop("Heatmap columns must match the position axis.")
  display_options <- if (is.null(display_options)) list() else display_options
  display_height_px <- if (!is.null(display_options$heightPx)) display_options$heightPx else NULL
  row_height_px <- if (!is.null(display_options$rowHeightPx)) display_options$rowHeightPx else NULL
  display_width_ratio <- if (!is.null(display_options$widthRatio)) display_options$widthRatio else NULL
  corner_radius_px <- if (!is.null(display_options$cornerRadiusPx)) display_options$cornerRadiusPx else NULL
  background_color <- if (!is.null(display_options$backgroundColor)) display_options$backgroundColor else NULL
  display_row_target <- if (!is.null(display_options$displayRowTarget)) display_options$displayRowTarget else NULL
  render_scale <- if (!is.null(display_options$renderScale)) display_options$renderScale else 1L
  palette <- if (!is.null(display_options$palette)) display_options$palette else c("#420046", "#fedc00")
  encoded <- site_profile_heatmap_data_uri(tag_matrix, palette = palette, target_rows = display_row_target, render_scale = render_scale)
  if (is.null(display_height_px) && !is.null(row_height_px) && is.finite(row_height_px) && row_height_px > 0) {
    display_height_px <- max(260, min(620, encoded$rows * row_height_px))
  }

  list(
    type = "heatmap",
    title = title,
    sampleName = sample_name,
    originalName = original_name,
    rows = encoded$rows,
    empty = encoded$rows == 0L,
    sourceRows = if (is.null(tag_matrix)) 0L else nrow(tag_matrix),
    signalRows = if (is.null(tag_matrix)) 0L else sum(rowSums(tag_matrix) > 0),
    rowAggregation = if (encoded$rows < sum(rowSums(tag_matrix) > 0)) "maximum" else "none",
    signalDefinition = display_options$signalDefinition,
    colorNormalization = "per-panel",
    columns = encoded$columns,
    matrixValues = encoded$matrix_values,
    xDomain = c(min(x_positions), max(x_positions)),
    imageData = encoded$image_data,
    displayHeightPx = display_height_px,
    displayWidthRatio = display_width_ratio,
    cornerRadiusPx = corner_radius_px,
    backgroundColor = background_color,
    palette = palette,
    colorMaxQuantile = display_options$colorMaxQuantile,
    showGrid = isTRUE(display_options$showGrid),
    pixelated = isTRUE(display_options$pixelated),
    gridOuterStroke = display_options$gridOuterStroke,
    gridOuterStrokeWidth = display_options$gridOuterStrokeWidth,
    horizontalGridStroke = display_options$horizontalGridStroke,
    verticalGridStroke = display_options$verticalGridStroke,
    gridStrokeWidth = display_options$gridStrokeWidth
  )
}
