package dispatch

import (
	"fmt"
	"math"
	"math/rand/v2"
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
	// D3: the last slot is reserved for a new Agent so newcomers get the exposure that
	// produces the training data the ranking model needs.
	exploreSlots = 1
	// D3: below this many finished tasks an Agent competes for the explore slot instead of
	// on score.
	newAgentTaskThreshold = 3

	queryMatchBoost = 0.06
	tagMatchBoost   = 0.04
)

// D2: only completion rate and quality have a data source today. The other three dimensions
// keep their field and their weight so they can be switched on without an API change.
const (
	weightCompletionRate     = 0.60
	weightQualityScore       = 0.40
	weightCommunicationScore = 0.0
	weightDisputeRate        = 0.0
	weightScaleScore         = 0.0
)

const (
	algorithmVersion = "demo-filter-keyword-rank-v1"
	modelVersion     = "heuristic-v1"
)

type TaskRequest struct {
	Category string   `json:"category"`
	Query    string   `json:"query"`
	Tags     []string `json:"tags"`
}

// Metrics holds the five ranking dimensions from docs/decisions.md D2. CompletedTasks is not a
// ranking dimension; it decides whether an Agent is still a newcomer.
type Metrics struct {
	CompletionRate     float64 `json:"completionRate"`
	QualityScore       float64 `json:"qualityScore"`
	CommunicationScore float64 `json:"communicationScore"`
	DisputeRate        float64 `json:"disputeRate"`
	ScaleScore         float64 `json:"scaleScore"`
	CompletedTasks     int     `json:"completedTasks"`
}

type Candidate struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Category     string   `json:"category"`
	Tags         []string `json:"tags"`
	Metrics      Metrics  `json:"metrics"`
	Score        float64  `json:"score"`
	Reasons      []string `json:"reasons"`
	Algorithm    string   `json:"algorithm"`
	ModelVersion string   `json:"modelVersion"`
}

// IsNewcomer reports whether the Agent still lacks the history the ranking model needs.
func (c Candidate) IsNewcomer() bool {
	return c.Metrics.CompletedTasks < newAgentTaskThreshold
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
			Metrics: Metrics{
				CompletionRate: 0.984, QualityScore: 0.94,
				CommunicationScore: 0.91, DisputeRate: 0.012, ScaleScore: 0.88,
				CompletedTasks: 128,
			},
		},
		{
			ID:       "agent_0x19bc",
			Name:     "Solidity Sentinel",
			Category: "合约审查",
			Tags:     []string{"Solidity", "智能合约", "安全审计"},
			Metrics: Metrics{
				CompletionRate: 0.957, QualityScore: 0.92,
				CommunicationScore: 0.86, DisputeRate: 0.008, ScaleScore: 0.79,
				CompletedTasks: 86,
			},
		},
		{
			ID:       "agent_0xd041",
			Name:     "Growth Copilot",
			Category: "增长策略",
			Tags:     []string{"增长", "营销", "内容策略"},
			Metrics: Metrics{
				CompletionRate: 0.931, QualityScore: 0.88,
				CommunicationScore: 0.9, DisputeRate: 0.021, ScaleScore: 0.64,
				CompletedTasks: 54,
			},
		},
		// Newcomers carry zero metrics on purpose: a single finished task would otherwise read
		// as a 100% completion rate and outrank agents with real history.
		{
			ID:       "agent_0x5e10",
			Name:     "New Signal",
			Category: "研究分析",
			Tags:     []string{"研究", "趋势", "Web3"},
		},
		{
			ID:       "agent_0x88c3",
			Name:     "Trend Scout",
			Category: "研究分析",
			Tags:     []string{"研究", "链上数据", "Web3"},
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

// Recommend applies the category and tag filters, scores the survivors with the D2 weights,
// and fills the D3 layout: the top ranked agents plus one randomly drawn newcomer. The vector
// store and the trained CTR model are still pending, so the ranking half stays deterministic.
func (e *Engine) Recommend(request TaskRequest) []Candidate {
	request = NormalizeTaskRequest(request)

	ranked := make([]Candidate, 0, len(e.candidates))
	newcomers := make([]Candidate, 0, len(e.candidates))
	for _, stored := range e.candidates {
		candidate, matched := evaluate(request, stored)
		if !matched {
			continue
		}
		if candidate.IsNewcomer() {
			newcomers = append(newcomers, candidate)
		} else {
			ranked = append(ranked, candidate)
		}
	}

	sortByScore(ranked)
	sortByScore(newcomers)
	return assemble(ranked, newcomers)
}

// assemble takes the highest scoring agents first, then hands the remaining slot to a random
// newcomer. Either pool backfills the other when it runs short.
func assemble(ranked, newcomers []Candidate) []Candidate {
	result := make([]Candidate, 0, maxRecommendations)
	promoted := min(len(ranked), maxRecommendations-exploreSlots)
	result = append(result, ranked[:promoted]...)

	if len(newcomers) > 0 && len(result) < maxRecommendations {
		drawn := rand.IntN(len(newcomers))
		explore := newcomers[drawn]
		explore.Reasons = append(explore.Reasons, "探索位随机选出")
		result = append(result, explore)
		newcomers = append(newcomers[:drawn:drawn], newcomers[drawn+1:]...)
	}

	for _, pool := range [][]Candidate{ranked[promoted:], newcomers} {
		for _, candidate := range pool {
			if len(result) == maxRecommendations {
				return result
			}
			result = append(result, candidate)
		}
	}
	return result
}

// evaluate reports whether the candidate survives the hard filters, and if so returns a scored
// copy carrying the reasons that explain the match.
func evaluate(request TaskRequest, stored Candidate) (Candidate, bool) {
	if request.Category != "" && !strings.EqualFold(stored.Category, request.Category) {
		return Candidate{}, false
	}
	matchedTags := intersectTags(request.Tags, stored.Tags)
	if len(request.Tags) > 0 && len(matchedTags) == 0 {
		return Candidate{}, false
	}

	candidate := cloneCandidate(stored)
	candidate.Score = baseScore(candidate.Metrics)
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
	candidate.Algorithm = algorithmVersion
	candidate.ModelVersion = modelVersion
	return candidate, true
}

func baseScore(metrics Metrics) float64 {
	return weightCompletionRate*metrics.CompletionRate +
		weightQualityScore*metrics.QualityScore +
		weightCommunicationScore*metrics.CommunicationScore +
		weightDisputeRate*(1-metrics.DisputeRate) +
		weightScaleScore*metrics.ScaleScore
}

func sortByScore(candidates []Candidate) {
	sort.SliceStable(candidates, func(i, j int) bool {
		return candidates[i].Score > candidates[j].Score
	})
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

// CatalogEntry is an Agent as it appears when browsing the market. Score and reasons stay on
// Candidate because they only mean something relative to a specific task.
type CatalogEntry struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Category   string   `json:"category"`
	Tags       []string `json:"tags"`
	Metrics    Metrics  `json:"metrics"`
	IsNewcomer bool     `json:"isNewcomer"`
}

// Catalog returns every Agent the engine can recommend, ordered the way ranking would order them
// with no task attached: established agents by base score, newcomers last. Newcomers sort to the
// bottom rather than by score because their zero metrics are missing data, not bad performance.
func (e *Engine) Catalog() []CatalogEntry {
	entries := make([]CatalogEntry, 0, len(e.candidates))
	for _, stored := range e.candidates {
		entries = append(entries, CatalogEntry{
			ID:         stored.ID,
			Name:       stored.Name,
			Category:   stored.Category,
			Tags:       append([]string(nil), stored.Tags...),
			Metrics:    stored.Metrics,
			IsNewcomer: stored.IsNewcomer(),
		})
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].IsNewcomer != entries[j].IsNewcomer {
			return !entries[i].IsNewcomer
		}
		return baseScore(entries[i].Metrics) > baseScore(entries[j].Metrics)
	})
	return entries
}
