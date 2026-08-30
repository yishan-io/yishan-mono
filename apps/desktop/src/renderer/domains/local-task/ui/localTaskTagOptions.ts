/** Returns a new option list with selected options before unselected options. */
export function sortLocalTaskTagsSelectedFirst<Option>(
  options: readonly Option[],
  isSelected: (option: Option) => boolean,
): Option[] {
  return options
    .map((option, index) => ({ option, index, selected: isSelected(option) }))
    .sort(
      (firstOption, secondOption) =>
        Number(secondOption.selected) - Number(firstOption.selected) || firstOption.index - secondOption.index,
    )
    .map(({ option }) => option);
}
