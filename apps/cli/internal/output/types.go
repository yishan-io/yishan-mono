package output

type RenderData struct {
	Title   string
	Columns []string
	Rows    []map[string]any
	Object  any
}
