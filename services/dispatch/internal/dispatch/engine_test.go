package dispatch

import (
	"math"
	"strings"
	"testing"
)

func TestRecommendReservesTheLastSlotForANewcomer(t *testing.T) {
	engine := NewEngine()
	result := engine.Recommend(TaskRequest{})
	if len(result) != 3 {
		t.Fatalf("expected 3 candidates, got %d", len(result))
	}

	for index, candidate := range result {
		if candidate.Algorithm == "" || candidate.ModelVersion == "" {
			t.Fatalf("candidate %d is missing algorithm metadata: %#v", index, candidate)
		}
	}

	ranked, explore := result[:2], result[2]
	for index, candidate := range ranked {
		if candidate.IsNewcomer() {
			t.Fatalf("ranked slot %d went to a newcomer: %#v", index, candidate)
		}
		if index > 0 && ranked[index-1].Score < candidate.Score {
			t.Fatalf("expected descending score order in ranked slots: %#v", ranked)
		}
	}
	if !explore.IsNewcomer() {
		t.Fatalf("explore slot went to an established agent: %#v", explore)
	}
	if !contains(explore.Reasons, "探索位随机选出") {
		t.Fatalf("explore slot is missing its reason: %#v", explore.Reasons)
	}
}

// The explore slot has to actually draw at random; a fixed pick would starve every newcomer but
// one and defeat the point of collecting training data.
func TestExploreSlotDrawsDifferentNewcomers(t *testing.T) {
	engine := NewEngine()
	drawn := make(map[string]struct{})
	for range 60 {
		result := engine.Recommend(TaskRequest{Category: "研究分析"})
		if len(result) != 3 {
			t.Fatalf("expected 1 ranked agent and 2 newcomers, got %d", len(result))
		}
		if !result[1].IsNewcomer() {
			t.Fatalf("second slot is not a newcomer: %#v", result[1])
		}
		drawn[result[1].ID] = struct{}{}
	}
	if len(drawn) < 2 {
		t.Fatalf("explore slot never varied across 60 calls: %v", drawn)
	}
}

// Pins the D2 weights: completion rate at 0.60 and quality at 0.40, with the other three
// dimensions contributing nothing until they have a data source.
func TestScoreUsesCompletionAndQualityOnly(t *testing.T) {
	engine := NewEngine()
	result := engine.Recommend(TaskRequest{Category: "研究分析"})
	if len(result) == 0 {
		t.Fatal("expected at least one candidate")
	}

	atlas := result[0]
	if atlas.ID != "agent_0x7a2f" {
		t.Fatalf("expected Atlas Researcher to rank first: %#v", atlas)
	}
	expected := 0.60*atlas.Metrics.CompletionRate + 0.40*atlas.Metrics.QualityScore
	expected = math.Round(expected*1000) / 1000
	if atlas.Score != expected {
		t.Fatalf("score %v does not match the D2 formula %v", atlas.Score, expected)
	}
}

func TestNewcomersScoreZeroUntilTheyHaveHistory(t *testing.T) {
	engine := NewEngine()
	result := engine.Recommend(TaskRequest{Category: "研究分析"})

	explore := result[1]
	if explore.Metrics.CompletedTasks != 0 {
		t.Fatalf("expected a newcomer with no history: %#v", explore.Metrics)
	}
	if explore.Score != 0 {
		t.Fatalf("expected a zero score without history, got %v", explore.Score)
	}
}

func TestRecommendAppliesCategoryFilter(t *testing.T) {
	engine := NewEngine()
	result := engine.Recommend(TaskRequest{Category: " 合约审查 "})
	if len(result) != 1 || result[0].ID != "agent_0x19bc" {
		t.Fatalf("unexpected filtered result: %#v", result)
	}
	if !contains(result[0].Reasons, "分类匹配") {
		t.Fatalf("expected category reason: %#v", result[0].Reasons)
	}
}

func TestRecommendAppliesTagFilter(t *testing.T) {
	engine := NewEngine()
	result := engine.Recommend(TaskRequest{Tags: []string{"solidity"}})
	if len(result) != 1 || result[0].ID != "agent_0x19bc" {
		t.Fatalf("unexpected tag-filtered result: %#v", result)
	}
	if !strings.Contains(strings.Join(result[0].Reasons, "|"), "标签匹配") {
		t.Fatalf("expected tag reason: %#v", result[0].Reasons)
	}
}

func TestRecommendUsesQueryForRanking(t *testing.T) {
	engine := NewEngine()
	result := engine.Recommend(TaskRequest{Query: "需要 Solidity 安全审计"})
	if len(result) == 0 || result[0].ID != "agent_0x19bc" {
		t.Fatalf("expected query match to rank first: %#v", result)
	}
	if !contains(result[0].Reasons, "关键词匹配") {
		t.Fatalf("expected query reason: %#v", result[0].Reasons)
	}
}

func TestRecommendReturnsDefensiveCopies(t *testing.T) {
	engine := NewEngine()
	first := engine.Recommend(TaskRequest{Category: "研究分析"})
	first[0].Tags[0] = "mutated"
	first[0].Reasons[0] = "mutated"

	second := engine.Recommend(TaskRequest{Category: "研究分析"})
	if second[0].Tags[0] == "mutated" || second[0].Reasons[0] == "mutated" {
		t.Fatalf("recommendation mutated engine state: %#v", second[0])
	}
}

func TestValidateTaskRequest(t *testing.T) {
	tests := []struct {
		name    string
		request TaskRequest
		wantErr bool
	}{
		{name: "category", request: TaskRequest{Category: "研究分析"}},
		{name: "query", request: TaskRequest{Query: "分析市场"}},
		{name: "tags", request: TaskRequest{Tags: []string{"Web3"}}},
		{name: "empty", request: TaskRequest{}, wantErr: true},
		{name: "blank tag", request: TaskRequest{Tags: []string{" "}}, wantErr: true},
		{name: "too many tags", request: TaskRequest{Tags: make([]string, MaxTags+1)}, wantErr: true},
		{name: "long category", request: TaskRequest{Category: strings.Repeat("类", MaxCategoryLength+1)}, wantErr: true},
		{name: "long query", request: TaskRequest{Query: strings.Repeat("问", MaxQueryLength+1)}, wantErr: true},
		{name: "long tag", request: TaskRequest{Tags: []string{strings.Repeat("标", MaxTagLength+1)}}, wantErr: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := ValidateTaskRequest(test.request)
			if (err != nil) != test.wantErr {
				t.Fatalf("ValidateTaskRequest() error = %v, wantErr %v", err, test.wantErr)
			}
		})
	}
}

func TestNormalizeTaskRequestDoesNotMutateInput(t *testing.T) {
	original := TaskRequest{Category: " 研究分析 ", Query: " 趋势 ", Tags: []string{" Web3 ", "web3", "研究"}}
	normalized := NormalizeTaskRequest(original)

	if normalized.Category != "研究分析" || normalized.Query != "趋势" {
		t.Fatalf("unexpected normalized strings: %#v", normalized)
	}
	if len(normalized.Tags) != 2 || normalized.Tags[0] != "Web3" || normalized.Tags[1] != "研究" {
		t.Fatalf("unexpected normalized tags: %#v", normalized.Tags)
	}
	if original.Tags[0] != " Web3 " {
		t.Fatalf("input was mutated: %#v", original.Tags)
	}
}

func contains(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}
