use super::storage::{encode_like, write_new};
use super::*;
use std::path::Path;

fn save_document(
    root: &Path,
    path: &Path,
    expected: &str,
    source: &str,
    now: u64,
) -> Result<SavedDocument, String> {
    super::storage::save_document(root, path, expected, source, now, DEFAULT_BUDGET_BYTES)
}

#[path = "budget_tests.rs"]
mod budget_tests;

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("mark-versions-test-{}-{nonce}", std::process::id()));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn source(&self, bytes: &[u8]) -> PathBuf {
        let path = self.0.join("study.md");
        fs::write(&path, bytes).unwrap();
        path
    }
    fn versions(&self) -> PathBuf {
        self.0.join("versions")
    }
    fn history(&self, path: &Path) -> PathBuf {
        history_dir(&self.versions(), path).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn exclusive_write_failure_never_deletes_an_existing_file() {
    let f = Fixture::new();
    let path = f.source(b"keep this");
    assert!(write_new(&path, b"do not replace").is_err());
    assert_eq!(fs::read(&path).unwrap(), b"keep this");
}

#[test]
fn compresses_large_snapshots_without_changing_the_working_markdown() {
    let f = Fixture::new();
    let original = "A paragraph worth studying.\r\n".repeat(20_000);
    let edited = format!("{original}\r\n- [x] Read\r\n");
    let path = f.source(original.as_bytes());
    save_document(&f.versions(), &path, &original, &edited, 100).unwrap();
    let dir = f.history(&path);
    let latest = list_versions(&dir).unwrap().remove(0);
    assert!(latest.id.ends_with(".md.gz"));
    assert_eq!(latest.bytes, edited.len() as u64);
    assert!(fs::metadata(dir.join(&latest.id)).unwrap().len() < edited.len() as u64 / 10);
    assert_eq!(fs::read_to_string(&path).unwrap(), edited);
    assert_eq!(
        crate::decode_text(&read_snapshot(&dir.join(&latest.id)).unwrap()).unwrap(),
        edited
    );
}

#[test]
fn rejects_trailing_payload_in_a_compressed_version() {
    let f = Fixture::new();
    let original = "Source paragraph\n".repeat(10_000);
    let path = f.source(original.as_bytes());
    save_document(
        &f.versions(),
        &path,
        &original,
        "A different paragraph\n".repeat(10_000).as_str(),
        100,
    )
    .unwrap();
    let dir = f.history(&path);
    let latest = list_versions(&dir).unwrap().remove(0);
    let snapshot = dir.join(latest.id);
    let mut stored = fs::read(&snapshot).unwrap();
    stored.extend_from_slice(b"unexpected bytes");
    fs::write(&snapshot, stored).unwrap();
    assert!(read_snapshot(&snapshot).is_err());
}

#[test]
fn restores_compressed_unicode_and_all_original_encodings() {
    for bom in [
        vec![],
        vec![0xef, 0xbb, 0xbf],
        vec![0xff, 0xfe],
        vec![0xfe, 0xff],
    ] {
        let f = Fixture::new();
        let original = "学习 and hé.\r\n".repeat(1000);
        let path = f.source(&encode_like(&bom, &original));
        let edited = format!("{original}- [x] Read\r\n");
        save_document(&f.versions(), &path, &original, &edited, 100).unwrap();
        let dir = f.history(&path);
        let latest = list_versions(&dir).unwrap().remove(0);
        assert_eq!(
            read_snapshot(&dir.join(latest.id)).unwrap(),
            encode_like(&bom, &edited)
        );
    }
}

#[test]
fn refuses_corrupt_or_oversized_compressed_versions_without_altering_source() {
    let f = Fixture::new();
    let original = "Source paragraph\n".repeat(1000);
    let path = f.source(original.as_bytes());
    let edited = format!("{original}Edited\n");
    save_document(&f.versions(), &path, &original, &edited, 100).unwrap();
    let dir = f.history(&path);
    let latest = list_versions(&dir).unwrap().remove(0);
    let stored = fs::read(dir.join(&latest.id)).unwrap();
    let forged = dir.join("00000000000000000100-000000000000aaaa.00000001.md.gz");
    fs::write(&forged, &stored).unwrap();
    assert!(read_snapshot(&forged).is_err());
    fs::write(dir.join(&latest.id), &stored[..stored.len() - 3]).unwrap();
    assert!(read_snapshot(&dir.join(&latest.id)).is_err());
    assert!(parse_version("00000000000000000100-000000000000aaaa.ffffffff.md.gz").is_none());
    assert_eq!(fs::read_to_string(path).unwrap(), edited);
}

#[test]
fn retains_compressed_latest_forever_and_reads_legacy_snapshots() {
    let f = Fixture::new();
    let path = f.source(b"first");
    let dir = f.history(&path);
    let legacy = dir.join("00000000000000000001-000000000000aaaa.md");
    fs::write(&legacy, b"first").unwrap();
    let edited = "A long paragraph\n".repeat(1000);
    save_document(&f.versions(), &path, "first", &edited, 100).unwrap();
    assert_eq!(read_snapshot(&legacy).unwrap(), b"first");
    prune_versions(&dir, RETENTION_MS * 100).unwrap();
    let remaining = list_versions(&dir).unwrap();
    assert_eq!(remaining.len(), 1);
    assert_eq!(
        read_snapshot(&dir.join(&remaining[0].id)).unwrap(),
        edited.as_bytes()
    );
}

#[test]
fn saves_the_actual_markdown_for_joint_attention() {
    let f = Fixture::new();
    let original = "# Study\r\n\r\n- [ ] Read\r\n";
    let edited = original.replace("[ ]", "[x]");
    let path = f.source(original.as_bytes());
    let receipt = save_document(&f.versions(), &path, original, &edited, 10_000).unwrap();
    assert_eq!(fs::read_to_string(path).unwrap(), edited);
    assert_eq!(receipt.saved_at, 10_000);
}

#[test]
fn refuses_external_changes_but_preserves_the_edited_version() {
    let f = Fixture::new();
    let path = f.source(b"External edit\n");
    assert!(
        save_document(&f.versions(), &path, "Original\n", "My pending edit\n", 100)
            .unwrap_err()
            .contains("changed outside MARK")
    );
    assert_eq!(fs::read_to_string(&path).unwrap(), "External edit\n");
    let dir = f.history(&path);
    let versions = list_versions(&dir).unwrap();
    assert_eq!(
        fs::read_to_string(dir.join(&versions[0].id)).unwrap(),
        "My pending edit\n"
    );
}

#[test]
fn keeps_original_encoding_bom_and_line_endings() {
    for bom in [
        vec![],
        vec![0xef, 0xbb, 0xbf],
        vec![0xff, 0xfe],
        vec![0xfe, 0xff],
    ] {
        let f = Fixture::new();
        let original = "# 学习\r\n- [ ] Hé\r\n";
        let bytes = encode_like(&bom, original);
        let path = f.source(&bytes);
        let edited = original.replace("[ ]", "[x]");
        save_document(&f.versions(), &path, original, &edited, 100).unwrap();
        assert_eq!(fs::read(&path).unwrap(), encode_like(&bom, &edited));
        assert_eq!(
            crate::decode_text(&fs::read(path).unwrap()).unwrap(),
            edited
        );
    }
}

#[test]
fn retains_the_exact_thirty_day_boundary_and_latest_forever() {
    let f = Fixture::new();
    let path = f.source(b"first");
    save_document(&f.versions(), &path, "first", "second", 10).unwrap();
    save_document(&f.versions(), &path, "second", "third", 20).unwrap();
    let dir = f.history(&path);
    prune_versions(&dir, RETENTION_MS + 10).unwrap();
    assert_eq!(list_versions(&dir).unwrap().len(), 2);
    prune_versions(&dir, RETENTION_MS * 100).unwrap();
    let versions = list_versions(&dir).unwrap();
    assert_eq!(versions.len(), 1);
    assert_eq!(
        fs::read_to_string(dir.join(&versions[0].id)).unwrap(),
        "third"
    );
    assert_eq!(fs::read_to_string(path).unwrap(), "third");
}

#[test]
fn does_not_create_idle_duplicates_or_lose_order_after_clock_rollback() {
    let f = Fixture::new();
    let path = f.source(b"first");
    save_document(&f.versions(), &path, "first", "second", 100).unwrap();
    save_document(&f.versions(), &path, "second", "second", 200).unwrap();
    let dir = f.history(&path);
    assert_eq!(list_versions(&dir).unwrap().len(), 2);
    save_document(&f.versions(), &path, "second", "third", 50).unwrap();
    let versions = list_versions(&dir).unwrap();
    assert_eq!(
        fs::read_to_string(dir.join(&versions[0].id)).unwrap(),
        "third"
    );
    assert!(versions[0].created_at > versions[1].created_at);
}

#[test]
fn never_recreates_a_missing_source_or_writes_to_an_unregistered_path() {
    let f = Fixture::new();
    let path = f.0.join("missing.md");
    assert!(save_document(&f.versions(), &path, "old", "new", 10).is_err());
    assert!(!path.exists());
    assert!(registered(&DocumentRegistry::default(), "unknown").is_err());
    assert!(parse_version("../../private.md").is_none());
    assert!(parse_version("00000000000000000010-0000000000000001.md").is_some());
}

#[test]
fn version_cleanup_does_not_touch_unknown_files_or_the_source() {
    let f = Fixture::new();
    let path = f.source(b"first");
    save_document(&f.versions(), &path, "first", "second", 10).unwrap();
    let dir = f.history(&path);
    fs::write(dir.join("user.md"), "keep").unwrap();
    prune_versions(&dir, RETENTION_MS * 100).unwrap();
    assert_eq!(fs::read_to_string(dir.join("user.md")).unwrap(), "keep");
    assert_eq!(fs::read_to_string(path).unwrap(), "second");
}

#[test]
fn fails_closed_on_corrupt_identity_or_invalid_source_encoding() {
    let f = Fixture::new();
    let path = f.source(b"original");
    let dir = f.history(&path);
    fs::write(dir.join("document.json"), b"corrupt").unwrap();
    assert!(save_document(&f.versions(), &path, "original", "edited", 10).is_err());
    assert_eq!(fs::read_to_string(&path).unwrap(), "original");
    fs::write(&path, [0xff, 0x00, 0x00]).unwrap();
    assert!(save_document(&f.versions(), &path, "original", "edited", 10).is_err());
}
