import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FileText } from 'lucide-react';

interface SampleTranscriptDialogProps {
  onLoadSample: (transcript: string, type: string, project: string, participants: string) => void;
}

export function SampleTranscriptDialog({ onLoadSample }: SampleTranscriptDialogProps) {
  const sampleTranscript = `Sprint Planning Meeting - Mobile App Redesign Project

Attendees: Sarah (PM), Mike (Engineering Lead), Lisa (Design Lead), John (Backend Dev)

Sarah: Thanks everyone for joining. Let's plan Sprint 15. Our main goal is to finalize the new navigation system and start on the user profile redesign.

Mike: I reviewed the navigation specs. The implementation looks straightforward, but we'll need to refactor the routing system. That's probably 13 story points. Should take most of the sprint.

Lisa: The profile screen designs are ready. I've shared them in Figma. We incorporated all the feedback from last week's user testing sessions.

Sarah: Great. Mike, can you break down the navigation work?

Mike: Sure. We need to:
1. Refactor the navigation state management
2. Implement the new bottom tab bar
3. Update all navigation flows
4. Add animations and transitions
5. Write unit tests

John can handle the backend API changes needed for the profile data. That's probably 5 points.

John: I can do that. But I'll need the exact data structure from the designs first. Lisa, can you send me the specs by Wednesday?

Lisa: Absolutely. I'll have them to you by end of day Tuesday.

Sarah: Perfect. Any risks we should flag?

Mike: The animation library we want to use is still in beta. We might hit some edge cases. I'd recommend building a prototype first before committing to the sprint.

Sarah: Good call. Let's timebox the prototype to 3 days. If it works, we continue. If not, we fall back to the standard transitions.

Lisa: What about the accessibility audit? We promised to include that.

Sarah: Right. Let's add that as a separate story - 3 points. Mike, can your team handle it?

Mike: Yes, we'll pair it with the navigation work since it's related.

Sarah: Excellent. So our sprint commitment is:
- Navigation system refactor: 13 points
- Profile API updates: 5 points  
- Accessibility audit: 3 points
- Total: 21 points

Everyone aligned?

Team: Yes / Sounds good / Agreed

Sarah: Great. Let's aim to have the navigation prototype done by Thursday for an early review. I'll schedule a demo with stakeholders for Friday.

Mike: One more thing - we're still blocked on the analytics integration. Marketing hasn't given us the tracking requirements yet.

Sarah: I'll follow up with them today and get you those requirements by tomorrow. Let's mark that as a blocker in Jira.

Lisa: Should we schedule the mid-sprint check-in?

Sarah: Yes, let's do Wednesday at 2 PM. That gives us time to course-correct if needed.

Mike: Perfect.

Sarah: Thanks everyone. Let's make it a great sprint!`;

  const handleLoadSample = () => {
    onLoadSample(
      sampleTranscript,
      'Sprint Planning',
      'Mobile App Redesign',
      'Sarah, Mike, Lisa, John'
    );
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileText className="h-4 w-4" />
          Load Sample
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Sample Meeting Transcript</DialogTitle>
          <DialogDescription>
            Load this sample Sprint Planning meeting transcript to test the analyzer
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[400px] overflow-y-auto rounded-lg border bg-muted/30 p-4">
          <pre className="whitespace-pre-wrap text-xs font-mono">
            {sampleTranscript}
          </pre>
        </div>
        <div className="flex justify-end gap-2">
          <DialogTrigger asChild>
            <Button variant="outline">Cancel</Button>
          </DialogTrigger>
          <DialogTrigger asChild>
            <Button onClick={handleLoadSample}>Load Sample</Button>
          </DialogTrigger>
        </div>
      </DialogContent>
    </Dialog>
  );
}
