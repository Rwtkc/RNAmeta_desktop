mod annotation_validation;
mod embedded_scripts;
mod r_engine;
mod upload_preview;

use annotation_validation::validate_annotation_directory;
use embedded_scripts::resolve_embedded_script_path;
use r_engine::{spawn_r_engine, validate_r_engine};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use upload_preview::{normalize_uploaded_bed_files, read_delimited_preview};

#[tauri::command]
fn resolve_resource_path(app: tauri::AppHandle, relative_path: String) -> Result<String, String> {
    let resource_dir = app.path().resource_dir().map_err(|error| error.to_string())?;
    let direct = resource_dir.join(&relative_path);
    if direct.exists() {
        return Ok(direct.display().to_string());
    }

    let parent_resource = resource_dir.join("_up_").join(&relative_path);
    if parent_resource.exists() {
        return Ok(parent_resource.display().to_string());
    }

    let nested = resource_dir.join("resources").join(&relative_path);
    if nested.exists() {
        return Ok(nested.display().to_string());
    }

    if let Some(embedded) = resolve_embedded_script_path(&app, &relative_path)? {
        return Ok(embedded.display().to_string());
    }

    Ok(direct.display().to_string())
}

#[tauri::command]
fn terminate_process_tree(pid: u32) -> Result<(), String> {
    if pid == 0 {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let pid_text = pid.to_string();
        let status = std::process::Command::new("taskkill")
            .args(["/PID", &pid_text, "/T", "/F"])
            .status()
            .map_err(|error| format!("Failed to execute taskkill: {error}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("taskkill failed for PID {pid}"))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let pid_text = pid.to_string();
        let status = std::process::Command::new("kill")
            .args(["-TERM", &pid_text])
            .status()
            .map_err(|error| format!("Failed to execute kill: {error}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("kill failed for PID {pid}"))
        }
    }
}

fn session_cache_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let cache_dir = app.path().app_cache_dir().map_err(|error| error.to_string())?;
    Ok(cache_dir.join("session-cache"))
}

fn clear_session_cache_root(app: &tauri::AppHandle) -> Result<(), String> {
    let root = session_cache_root(app)?;
    if root.exists() {
        fs::remove_dir_all(&root).map_err(|error| {
            format!(
                "Failed to remove session cache directory '{}': {error}",
                root.display()
            )
        })?;
    }
    Ok(())
}

#[tauri::command]
fn resolve_session_cache_path(
    app: tauri::AppHandle,
    relative_path: Option<String>,
) -> Result<String, String> {
    let root = session_cache_root(&app)?;
    fs::create_dir_all(&root).map_err(|error| {
        format!(
            "Failed to create session cache directory '{}': {error}",
            root.display()
        )
    })?;

    let path = match relative_path {
        Some(relative) if !relative.trim().is_empty() => {
            let target = root.join(relative);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    format!(
                        "Failed to create session cache parent directory '{}': {error}",
                        parent.display()
                    )
                })?;
            }
            target
        }
        _ => root,
    };

    Ok(path.display().to_string())
}

#[tauri::command]
fn build_analysis_cache_key(
    module_name: String,
    annotation_dir: String,
    species_id: String,
    file_paths: Vec<String>,
    controls_json: String,
) -> Result<String, String> {
    let mut hasher = Sha256::new();
    hasher.update(module_name.as_bytes());
    hasher.update(b"\n");
    hasher.update(annotation_dir.as_bytes());
    hasher.update(b"\n");
    hasher.update(species_id.as_bytes());
    hasher.update(b"\n");
    hasher.update(controls_json.as_bytes());
    hasher.update(b"\n");

    for path in file_paths {
        let path_buf = PathBuf::from(&path);
        let metadata = fs::metadata(&path_buf).map_err(|error| {
            format!(
                "Failed to read analysis input metadata '{}': {error}",
                path_buf.display()
            )
        })?;
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs())
            .unwrap_or_default();

        hasher.update(path.as_bytes());
        hasher.update(b"|");
        hasher.update(metadata.len().to_string().as_bytes());
        hasher.update(b"|");
        hasher.update(modified.to_string().as_bytes());
        hasher.update(b"\n");
    }

    let digest = hasher.finalize();
    let key = digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();

    Ok(key)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            validate_r_engine(app.handle())?;
            clear_session_cache_root(app.handle())?;
            let root = session_cache_root(app.handle())?;
            fs::create_dir_all(&root).map_err(|error| {
                format!(
                    "Failed to initialize session cache directory '{}': {error}",
                    root.display()
                )
            })?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_delimited_preview,
            normalize_uploaded_bed_files,
            validate_annotation_directory,
            resolve_resource_path,
            spawn_r_engine,
            terminate_process_tree,
            resolve_session_cache_path,
            build_analysis_cache_key
        ])
        .build(tauri::generate_context!())
        .expect("error while building RNAmeta desktop");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            let _ = clear_session_cache_root(app_handle);
        }
    });
}
