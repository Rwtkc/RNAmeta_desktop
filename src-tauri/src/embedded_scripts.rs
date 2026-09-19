use include_dir::{include_dir, Dir};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::Manager;

static EMBEDDED_SCRIPTS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/resources/scripts");
static EMBEDDED_SCRIPTS_READY: OnceLock<Result<(), String>> = OnceLock::new();

fn copy_dir(dir: &Dir<'_>, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|error| {
        format!(
            "Failed to create embedded script directory '{}': {error}",
            dest.display()
        )
    })?;

    for file in dir.files() {
        let file_name = file.path().file_name().ok_or_else(|| {
            format!(
                "Embedded script file is missing a name: '{}'",
                file.path().display()
            )
        })?;
        let dest_path = dest.join(file_name);
        fs::write(&dest_path, file.contents()).map_err(|error| {
            format!(
                "Failed to write embedded script file '{}': {error}",
                dest_path.display()
            )
        })?;
    }

    for subdir in dir.dirs() {
        let dir_name = subdir.path().file_name().ok_or_else(|| {
            format!(
                "Embedded script directory is missing a name: '{}'",
                subdir.path().display()
            )
        })?;
        copy_dir(subdir, &dest.join(dir_name))?;
    }

    Ok(())
}

pub fn resolve_embedded_script_path(
    app: &tauri::AppHandle,
    relative_path: &str,
) -> Result<Option<PathBuf>, String> {
    let normalized = relative_path.replace('\\', "/");
    let script_relative = normalized
        .strip_prefix("scripts/")
        .or_else(|| normalized.strip_prefix("resources/scripts/"));

    let Some(script_relative) = script_relative else {
        return Ok(None);
    };

    let root = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("session-cache")
        .join("embedded-resources")
        .join("scripts");
    if let Err(error) = EMBEDDED_SCRIPTS_READY.get_or_init(|| copy_dir(&EMBEDDED_SCRIPTS, &root)) {
        return Err(error.clone());
    }

    Ok(Some(root.join(PathBuf::from(script_relative))))
}
