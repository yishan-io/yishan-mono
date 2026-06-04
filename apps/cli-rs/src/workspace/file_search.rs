use crate::workspace::types::{FileEntry, FileSearchResult};

const FILENAME_MATCH_BASE_SCORE: i64 = 2_000;
const PATH_MATCH_BASE_SCORE: i64 = 1_000;
const CONTIGUOUS_BASE_SCORE: i64 = 700;
const SUBSEQUENCE_BASE_SCORE: i64 = 500;

struct SubsequenceMatch {
    indexes: Vec<usize>,
    score: i64,
}

pub fn search_workspace_entries(
    entries: &[FileEntry],
    raw_query: &str,
    limit: usize,
) -> Vec<FileSearchResult> {
    let query = raw_query.trim().to_lowercase();
    let mut results: Vec<FileSearchResult> = entries
        .iter()
        .filter(|entry| !entry.is_ignored && !entry.is_dir)
        .filter_map(|entry| resolve_file_path_match(&format_search_path(entry), &query))
        .collect();

    results.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| left.path.len().cmp(&right.path.len()))
            .then_with(|| left.path.cmp(&right.path))
    });
    results.truncate(limit);
    results
}

fn format_search_path(entry: &FileEntry) -> String {
    if entry.is_dir {
        format!("{}/", entry.path.trim_end_matches('/'))
    } else {
        entry.path.clone()
    }
}

fn compact_path_query(query: &str) -> String {
    query
        .chars()
        .filter(|character| *character != '/' && *character != '\\' && !character.is_whitespace())
        .collect()
}

fn resolve_subsequence_match(target: &str, query: &str) -> Option<SubsequenceMatch> {
    let contiguous = target.find(query).map(|start| SubsequenceMatch {
        indexes: (start..start + query.len()).collect(),
        score: CONTIGUOUS_BASE_SCORE - (start as i64) * 2 - target.len() as i64,
    });

    let mut indexes = Vec::with_capacity(query.len());
    let mut next_index = 0usize;
    for character in query.chars() {
        let Some(relative_index) = target[next_index..].find(character) else {
            return contiguous;
        };
        let found_index = next_index + relative_index;
        indexes.push(found_index);
        next_index = found_index + character.len_utf8();
    }

    let first_index = *indexes.first().unwrap_or(&0) as i64;
    let last_index = *indexes.last().unwrap_or(&0) as i64;
    let spread = last_index - first_index - query.len() as i64 + 1;
    let subsequence = SubsequenceMatch {
        indexes,
        score: SUBSEQUENCE_BASE_SCORE - spread * 3 - first_index * 2 - target.len() as i64,
    };

    match contiguous {
        Some(contiguous_match) if contiguous_match.score >= subsequence.score => {
            Some(contiguous_match)
        }
        _ => Some(subsequence),
    }
}

fn resolve_file_path_match(path: &str, query: &str) -> Option<FileSearchResult> {
    if query.is_empty() {
        return Some(FileSearchResult {
            path: path.to_string(),
            score: -(path.len() as i64),
            highlighted_path_indexes: Vec::new(),
        });
    }

    let match_path = path.trim_end_matches('/');
    let normalized_path = match_path.to_lowercase();
    let filename_start = match_path.rfind('/').map(|index| index + 1).unwrap_or(0);
    let normalized_filename = &normalized_path[filename_start..];

    if let Some(filename_match) = resolve_subsequence_match(normalized_filename, query) {
        return Some(FileSearchResult {
            path: path.to_string(),
            score: FILENAME_MATCH_BASE_SCORE + filename_match.score,
            highlighted_path_indexes: filename_match
                .indexes
                .into_iter()
                .map(|index| index + filename_start)
                .collect(),
        });
    }

    let path_query = compact_path_query(query);
    let path_match = resolve_subsequence_match(&normalized_path, &path_query)?;
    Some(FileSearchResult {
        path: path.to_string(),
        score: PATH_MATCH_BASE_SCORE + path_match.score,
        highlighted_path_indexes: path_match.indexes,
    })
}
