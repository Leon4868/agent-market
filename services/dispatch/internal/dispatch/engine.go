package dispatch

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"unicode/utf8"
)

const (
	MaxCategoryLength = 64
	MaxQueryLength    = 2000
	MaxTags           = 20
	MaxTagLength      = 64

	maxRecommendations = 3
	queryMatchBoost    = 0.06
	tagMatchBoost      = 0.04
)

type TaskRequest struct {
	Category string   `json:"category"`
	Query    string   `json:"query"`
	Tags     []string `json:"tags"`
}

type Candidate struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Category     string   `json:"category"`
	Tags         []string `json:"tags"`
	Score        float64  `json:"score"`
	Reasons      []string `json:"reasons"`
	Algorithm    string   `json:"algorithm"`
	ModelVersion string   `json:"modelVersion"`
}

type Engine struct {
	candidates []Candidate
}

func NewEngine() *Engine {
	return &Engine{candidates: []Candidate{
		{
			ID:       "agent_0x7a2f",
			Name:     "Atlas Researcher",
			Category: "研究分析",
			Tags:     []string{"研究", "数据分析", "Web3"},
			Score:    0.96,
			Reasons:  []string{"历史完成率高"},
		},
		{
			ID:       "agent_0x19bc",
			Name:     "Solidity Sentinel",
			Category: "合约审查",
			Tags:     []string{"Solidity", "智能合约", "安全审计"},
			Score:    0.92,
			Reasons:  []string{"争议率低"},
		},
		{
			ID:       "agent_0xd041",
			Name:     "Growth Copilot",
			Category: "增长策略",
			Tags:     []string{"增长", "营销", "内容策略"},
			Score:    0.89,
			Reasons:  []string{"历史质量反馈高"},
		},
		{
			ID:       "agent_0x5e10",
			Name:     "New Signal",
			Category: "研究分析",
			Tags:     []string{"研究", "趋势", "Web3"},
			Score:    0.81,
			Reasons:  []string{"新 Agent 探索位"},
		},
	}}
}

// ValidateTaskRequest enforces the public API boundary before recommendation.
// At least one matching signal is required so an accidental empty request does
// not return globally top-ranked agents.
func ValidateTaskRequest(request TaskRequest) error {
	category := strings.TrimSpace(request.Category)
	query := strings.TrimSpace(request.Query)
	if category == "" && query == "" && len(request.Tags) == 0 {
		return fmt.Errorf("at least one of category, query, or tags is required")
	}
	if utf8.RuneCountInString(category) > MaxCategoryLength {
		return fmt.Errorf("category must be at most %d characters", MaxCategoryLength)
	}
	if utf8.RuneCountInString(query) > MaxQueryLength {
		return fmt.Errorf("query must be at most %d characters", MaxQueryLength)
	}
	if len(request.Tags) > MaxTags {
		return fmt.Errorf("tags must contain at most %d items", MaxTags)
	}
	for _, tag := range request.Tags {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			return fmt.Errorf("tags must not contain empty values")
		}
		if utf8.RuneCountInString(tag) > MaxTagLength {
			return fmt.Errorf("each tag must be at most %d characters", MaxTagLength)
		}
	}
	return nil
}

// NormalizeTaskRequest trims text and removes duplicate tags. It returns a new
// value and never mutates the caller's tag slice.
func NormalizeTaskRequest(request TaskRequest) TaskRequest {
	normalized := TaskRequest{
		Category: strings.TrimSpace(request.Category),
		Query:    strings.TrimSpace(request.Query),
		Tags:     make([]string, 0, len(request.Tags)),
	}
	seen := make(map[string]struct{}, len(request.Tags))
	for _, tag := range request.Tags {
		tag = strings.TrimSpace(tag)
		key := strings.ToLower(tag)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		normalized.Tags = append(normalized.Tags, tag)
	}
	return normalized
}

// Recommend is deterministic while the vector store and trained CTR model are
// pending. It applies category and tag filters, adds a small keyword-ranking
// boost, and returns at most three versioned results.
func (e *Engine) Recommend(request TaskRequest) []Candidate {
	request = NormalizeTaskRequest(request)
	result := make([]Candidate, 0, len(e.candidates))
	for _, stored := range e.candidates {
		if request.Category != "" && !strings.EqualFold(stored.Category, request.Category) {
			continue
		}

		matchedTags := intersectTags(request.Tags, stored.Tags)
		if len(request.Tags) > 0 && len(matchedTags) == 0 {
			continue
		}

		candidate := cloneCandidate(stored)
		if request.Category != "" {
			candidate.Reasons = append(candidate.Reasons, "分类匹配")
		}
		if len(matchedTags) > 0 {
			candidate.Score += tagMatchBoost * float64(len(matchedTags)) / float64(len(request.Tags))
			candidate.Reasons = append(candidate.Reasons, "标签匹配: "+strings.Join(matchedTags, ", "))
		}
		if request.Query != "" && matchesQuery(request.Query, candidate) {
			candidate.Score += queryMatchBoost
			candidate.Reasons = append(candidate.Reasons, "关键词匹配")
		}
		candidate.Score = math.Min(1, math.Round(candidate.Score*1000)/1000)
		candidate.Algorithm = "demo-filter-keyword-rank-v1"
		candidate.ModelVersion = "heuristic-v1"
		result = append(result, candidate)
	}

	sort.SliceStable(result, func(i, j int) bool {
		return result[i].Score > result[j].Score
	})
	if len(result) > maxRecommendations {
		result = result[:maxRecommendations]
	}
	return result
}

func cloneCandidate(candidate Candidate) Candidate {
	candidate.Tags = append([]string(nil), candidate.Tags...)
	candidate.Reasons = append([]string(nil), candidate.Reasons...)
	return candidate
}

func intersectTags(requestTags, candidateTags []string) []string {
	available := make(map[string]struct{}, len(candidateTags))
	for _, tag := range candidateTags {
		available[strings.ToLower(tag)] = struct{}{}
	}
	matched := make([]string, 0, len(requestTags))
	for _, tag := range requestTags {
		if _, exists := available[strings.ToLower(tag)]; exists {
			matched = append(matched, tag)
		}
	}
	return matched
}

func matchesQuery(query string, candidate Candidate) bool {
	query = strings.ToLower(strings.TrimSpace(query))
	terms := make([]string, 0, len(candidate.Tags)+2)
	terms = append(terms, candidate.Name, candidate.Category)
	terms = append(terms, candidate.Tags...)
	for _, term := range terms {
		term = strings.ToLower(strings.TrimSpace(term))
		if term != "" && (strings.Contains(query, term) || strings.Contains(term, query)) {
			return true
		}
	}
	return false
}
