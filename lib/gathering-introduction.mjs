// Match PostgreSQL char_length: count Unicode characters, excluding outer spaces.
export function gatheringIntroduction(title, summary) {
 const titleLength=Array.from(title.trim()).length;
 const summaryLength=Array.from(summary.trim()).length;
 return {
  titleLength,summaryLength,
  titleError:titleLength<4 ? "Give your gathering a name with at least 4 characters." : titleLength>140 ? "Keep the gathering name within 140 characters." : "",
  summaryError:summaryLength<40 ? `Add a little more detail about the gathering—at least ${40-summaryLength} more characters.` : summaryLength>2000 ? "Keep the description within 2,000 characters." : "",
 };
}
