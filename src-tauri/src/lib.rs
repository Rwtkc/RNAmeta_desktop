mod embedded_scripts;
mod r_engine;
mod upload_preview;

use embedded_scripts::resolve_embedded_script_path;
use r_engine::{spawn_r_engine, validate_r_engine};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use upload_preview::{normalize_uploaded_bed_files, read_delimited_preview};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AnnotationValidation {
    exists: bool,
    is_valid: bool,
    root_path: String,
    registry_path: Option<String>,
    txdb_dir: Option<String>,
    txlens_dir: Option<String>,
    gff_dir: Option<String>,
    available_species: Vec<String>,
    species_supported: bool,
    missing_items: Vec<String>,
    species_files: Vec<String>,
}

#[tauri::command]
fn validate_annotation_directory(
    path: String,
    species: Option<String>,
) -> Result<AnnotationValidation, String> {
    let root = PathBuf::from(&path);
    let txdb_dir = root.join("txdb");
    let txlens_dir = root.join("txlens");
    let gff_dir = root.join("gff");
    let structured_layout = txdb_dir.exists() && txlens_dir.exists() && gff_dir.exists();

    let mut missing_items = Vec::new();
    if !root.exists() {
        missing_items.push("annotation directory".to_string());
    }

    let available_species = Vec::new();
    let mut species_supported = species.is_none();
    let mut species_files = Vec::new();

    if let Some(target_species) = &species {
        let flat_expected = [
            root.join(format!("{target_species}.txdb.sqlite")),
            root.join(format!("{target_species}.txlens.rda")),
            root.join(format!("{target_species}.gff.rda")),
        ];

        if flat_expected.iter().all(|file| file.exists()) {
            species_supported = true;
            species_files.extend(flat_expected.iter().map(|file| file.display().to_string()));
        } else {
            let structured_expected = [
                txdb_dir.join(format!("{target_species}.txdb.sqlite")),
                txlens_dir.join(format!("{target_species}.txlens.rda")),
                gff_dir.join(format!("{target_species}.gff.rda")),
            ];

            if structured_layout && structured_expected.iter().all(|file| file.exists()) {
                species_supported = true;
                species_files
                    .extend(structured_expected.iter().map(|file| file.display().to_string()));
            } else {
                for file in flat_expected {
                    if !file.exists() {
                        missing_items.push(file.display().to_string());
                    }
                }

                if structured_layout {
                    for file in structured_expected {
                        if !file.exists() {
                            missing_items.push(file.display().to_string());
                        }
                    }
                }
            }
        }

        if target_species == "ara_TAIR10" {
            for file_name in [
                "Arabidopsis_thaliana.TAIR10.dna.toplevel.fa",
                "Arabidopsis_thaliana.TAIR10.dna.toplevel.fa.fai",
                "Arabidopsis_thaliana.TAIR10.51.gff3.gz",
            ] {
                let file = root.join(file_name);
                if file.is_file() {
                    species_files.push(file.display().to_string());
                } else {
                    missing_items.push(file.display().to_string());
                }
            }
        }
    }

    Ok(AnnotationValidation {
        exists: root.exists(),
        is_valid: missing_items.is_empty(),
        root_path: path,
        registry_path: None,
        txdb_dir: txdb_dir.exists().then(|| txdb_dir.display().to_string()),
        txlens_dir: txlens_dir.exists().then(|| txlens_dir.display().to_string()),
        gff_dir: gff_dir.exists().then(|| gff_dir.display().to_string()),
        available_species,
        species_supported,
        missing_items,
        species_files,
    })
}

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

#[cfg(test)]
mod tests {
    use super::validate_annotation_directory;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn tair10_validation_includes_genome_browser_and_structure_files() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be available")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("rnameta_tair10_validation_{unique}"));
        fs::create_dir_all(&root).expect("temporary annotation directory should be created");

        let required = [
            "ara_TAIR10.txdb.sqlite",
            "ara_TAIR10.txlens.rda",
            "ara_TAIR10.gff.rda",
            "Arabidopsis_thaliana.TAIR10.dna.toplevel.fa",
            "Arabidopsis_thaliana.TAIR10.dna.toplevel.fa.fai",
            "Arabidopsis_thaliana.TAIR10.51.gff3.gz",
        ];
        for file_name in required {
            fs::write(root.join(file_name), b"test").expect("test resource should be written");
        }

        let valid = validate_annotation_directory(
            root.display().to_string(),
            Some("ara_TAIR10".to_string()),
        )
        .expect("validation should complete");
        assert!(valid.is_valid);
        assert_eq!(valid.species_files.len(), 6);

        let missing_name = "Arabidopsis_thaliana.TAIR10.dna.toplevel.fa.fai";
        fs::remove_file(root.join(missing_name)).expect("test FAI should be removed");
        let invalid = validate_annotation_directory(
            root.display().to_string(),
            Some("ara_TAIR10".to_string()),
        )
        .expect("validation should complete");
        assert!(!invalid.is_valid);
        assert!(invalid.missing_items.iter().any(|item| item.ends_with(missing_name)));

        fs::remove_dir_all(root).expect("temporary annotation directory should be removed");
    }
}
