package tokenusage

func normalizedUsageCostSource(source CostSource) CostSource {
	if source == "" {
		return CostSourceUnknown
	}
	return source
}

func usageCostSourcePriority(source CostSource) int {
	switch normalizedUsageCostSource(source) {
	case CostSourceDirect:
		return 3
	case CostSourceEstimated:
		return 2
	default:
		return 1
	}
}
