use super::{Fixture, DEFAULT_BUDGET_BYTES};
use crate::versions::storage::{list_versions, save_document};
use std::fs;

#[test]
fn refuses_an_over_budget_save_without_altering_source_or_history() {
    let fixture = Fixture::new();
    let path = fixture.source(b"Original");
    save_document(
        &fixture.versions(),
        &path,
        "Original",
        "Saved",
        100,
        DEFAULT_BUDGET_BYTES,
    )
    .unwrap();
    let dir = fixture.history(&path);
    let before = list_versions(&dir).unwrap();
    let copies: Vec<_> = before
        .iter()
        .map(|version| fs::read(dir.join(&version.id)).unwrap())
        .collect();
    let failure = save_document(
        &fixture.versions(),
        &path,
        "Saved",
        "Keep my pending edit",
        200,
        1,
    )
    .unwrap_err();
    assert!(failure.contains("storage budget"), "{failure}");
    assert_eq!(fs::read_to_string(&path).unwrap(), "Saved");
    let after = list_versions(&dir).unwrap();
    assert_eq!(
        before.iter().map(|v| &v.id).collect::<Vec<_>>(),
        after.iter().map(|v| &v.id).collect::<Vec<_>>()
    );
    for (version, copy) in before.iter().zip(copies) {
        assert_eq!(fs::read(dir.join(&version.id)).unwrap(), copy);
    }
}

#[test]
fn unchanged_first_save_creates_only_one_version() {
    let fixture = Fixture::new();
    let path = fixture.source(b"Original");
    save_document(
        &fixture.versions(),
        &path,
        "Original",
        "Original",
        100,
        DEFAULT_BUDGET_BYTES,
    )
    .unwrap();
    assert_eq!(list_versions(&fixture.history(&path)).unwrap().len(), 1);
}

#[test]
fn receipt_counts_encoded_source_compressed_versions_and_metadata() {
    let fixture = Fixture::new();
    let original = "A".repeat(100_000);
    let path = fixture.source(original.as_bytes());
    let source = format!("{original} Edited");
    let receipt = save_document(
        &fixture.versions(),
        &path,
        &original,
        &source,
        100,
        DEFAULT_BUDGET_BYTES,
    )
    .unwrap();
    let dir = fixture.history(&path);
    let retained_bytes: u64 = fs::read_dir(&dir)
        .unwrap()
        .map(|entry| entry.unwrap().metadata().unwrap().len())
        .sum();
    assert_eq!(
        receipt.storage.used_bytes,
        source.len() as u64 + retained_bytes
    );
    assert_eq!(receipt.storage.limit_bytes, DEFAULT_BUDGET_BYTES);
    assert!(!receipt.storage.warning);
    assert!(retained_bytes < original.len() as u64 / 10);
}

#[test]
fn native_budget_defaults_warns_and_validates_settings_bounds() {
    use crate::versions::budget::{projected_usage, require_budget, validated_limit};
    let fixture = Fixture::new();
    fs::create_dir_all(fixture.versions()).unwrap();
    assert_eq!(validated_limit(None).unwrap(), DEFAULT_BUDGET_BYTES);
    assert!(validated_limit(Some(63 * 1024 * 1024)).is_err());
    assert!(validated_limit(Some(64 * 1024 * 1024)).is_ok());
    assert!(validated_limit(Some(16 * DEFAULT_BUDGET_BYTES)).is_ok());
    assert!(validated_limit(Some(16 * DEFAULT_BUDGET_BYTES + 1)).is_err());
    assert!(
        !projected_usage(&fixture.versions(), 79, 0, 100)
            .unwrap()
            .warning
    );
    assert!(
        projected_usage(&fixture.versions(), 80, 0, 100)
            .unwrap()
            .warning
    );
    assert!(require_budget(&projected_usage(&fixture.versions(), 100, 0, 100).unwrap()).is_ok());
    assert!(require_budget(&projected_usage(&fixture.versions(), 101, 0, 100).unwrap()).is_err());
}

#[test]
fn utf16_size_boundary_preserves_readability_and_rejects_growth_without_writes() {
    let fixture = Fixture::new();
    let path = fixture.source(&[0xff, 0xfe, b'A', 0]);
    let exact = "B".repeat((crate::MAX_TEXT_BYTES / 2 - 1) as usize);
    save_document(
        &fixture.versions(),
        &path,
        "A",
        &exact,
        100,
        DEFAULT_BUDGET_BYTES,
    )
    .unwrap();
    let raw = fs::read(&path).unwrap();
    assert_eq!(raw.len() as u64, crate::MAX_TEXT_BYTES);
    assert_eq!(crate::decode_text(&raw).unwrap(), exact);
    assert_eq!(crate::versions::storage::read_bytes(&path).unwrap(), raw);
    let dir = fixture.history(&path);
    let before = list_versions(&dir).unwrap();
    assert_eq!(before.len(), 2);
    let copies: Vec<_> = before
        .iter()
        .map(|version| fs::read(dir.join(&version.id)).unwrap())
        .collect();
    let failure = save_document(
        &fixture.versions(),
        &path,
        &exact,
        &format!("{exact}B"),
        200,
        DEFAULT_BUDGET_BYTES,
    )
    .unwrap_err();
    assert_eq!(failure, "Edited Markdown is larger than 16 MB.");
    assert_eq!(fs::read(&path).unwrap(), raw);
    let after = list_versions(&dir).unwrap();
    assert_eq!(
        before.iter().map(|v| &v.id).collect::<Vec<_>>(),
        after.iter().map(|v| &v.id).collect::<Vec<_>>()
    );
    for (version, copy) in before.iter().zip(copies) {
        assert_eq!(fs::read(dir.join(&version.id)).unwrap(), copy);
    }
}
